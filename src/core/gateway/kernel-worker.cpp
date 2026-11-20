// Kernel worker: OCCT 7.9.3 wrapped behind gRPC Kernel.Execute over UDS.
// Build: CMakeLists.txt at repo root (OCCT 7.9.3 + protobuf + gRPC).
//
// See docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md
// for architecture, authority model, and error handling.

#include <grpcpp/grpcpp.h>
#include <iostream>
#include <string>
#include <unordered_map>

// Generated C++ protobuf/gRPC stubs from engine.proto (protoc --cpp_out / grpc_cpp_plugin)
#include "webcad/engine/v1/engine.grpc.pb.h"

// OCCT 7.9.3 includes: all public headers live under opencascade/.
// TKernel.hxx and TKBRep.hxx do not exist as headers (they're library names).
// Standard_Exception.hxx does not exist; Standard_Failure is the base exception class.
#include <opencascade/Standard_Failure.hxx>
#include <opencascade/BRepPrimAPI_MakeBox.hxx>
#include <opencascade/BRepMesh_IncrementalMesh.hxx>
#include <opencascade/TopoDS_Shape.hxx>
#include <opencascade/gp_Pnt.hxx>
#include <opencascade/BinTools.hxx>
#include <cstdio>
#include <unistd.h>
#include <fstream>
#include <vector>

using grpc::Server;
using grpc::ServerBuilder;
using grpc::ServerContext;
using grpc::Status;
using grpc::StatusCode;
using webcad::engine::v1::ExecuteRequest;
using webcad::engine::v1::ExecuteResponse;
using webcad::engine::v1::ExecuteFailure;
using webcad::engine::v1::ExecutionFailureCode;
using webcad::engine::v1::ExecuteSuccess;
using webcad::engine::v1::BoxResult;
using webcad::engine::v1::KernelService;
using webcad::engine::v1::MeshData;
using webcad::engine::v1::BrepReference;
using webcad::engine::v1::ExecuteProgress;
using webcad::engine::v1::RestoreRequest;
using webcad::engine::v1::RestoreResponse;
using webcad::engine::v1::PutBlobRequest;
using webcad::engine::v1::PutBlobResponse;
using webcad::engine::v1::ResultChunkRequest;
using webcad::engine::v1::ResultChunk;
using webcad::engine::v1::HealthRequest;
using webcad::engine::v1::HealthResponse;

// Per-session shape cache: shape_id -> TopoDS_Shape
// Stage 1: client-authoritative, kernel is a rebuildable per-session cache.
// TopoDS_Shape is stored by value (it is a lightweight handle-like OCCT class,
// not a Standard_Transient subclass, so opencascade::handle<> does not apply).
static std::unordered_map<std::string, TopoDS_Shape> g_shapeCache;

class KernelServiceImpl final : public KernelService::Service {
 public:
  Status Execute(ServerContext* /*context*/, const ExecuteRequest* request,
                 ExecuteResponse* response) override {
    response->mutable_header()->set_request_id(request->header().request_id());

    try {
      switch (request->op_case()) {
        case ExecuteRequest::kCreateBox:
          return HandleCreateBox(request, response);
        case ExecuteRequest::kImportBRep:
          return HandleImportBRep(request, response);
        case ExecuteRequest::kExportBRep:
          return HandleExportBRep(request, response);
        default:
          return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER,
                            "Unknown or missing operation");
      }
    } catch (const Standard_Failure& e) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_UNSPECIFIED,
                        e.GetMessageString());
    } catch (const std::exception& e) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_UNSPECIFIED,
                        e.what());
    } catch (...) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_UNSPECIFIED,
                        "Unknown exception");
    }
  }

  Status ExecuteWithProgress(ServerContext* /*context*/,
                             const ExecuteRequest* /*request*/,
                             grpc::ServerWriter<ExecuteProgress>* /*writer*/) override {
    return Status(StatusCode::UNIMPLEMENTED, "ExecuteWithProgress not yet implemented");
  }

  Status Restore(ServerContext* /*context*/, const RestoreRequest* /*request*/,
                 RestoreResponse* /*response*/) override {
    return Status(StatusCode::UNIMPLEMENTED, "Restore not yet implemented");
  }

  Status PutBlob(ServerContext* /*context*/,
                 grpc::ServerReader<PutBlobRequest>* /*reader*/,
                 PutBlobResponse* /*response*/) override {
    return Status(StatusCode::UNIMPLEMENTED, "PutBlob not yet implemented");
  }

  Status StreamResult(ServerContext* /*context*/,
                      grpc::ServerReaderWriter<ResultChunk, ResultChunkRequest>* /*stream*/) override {
    return Status(StatusCode::UNIMPLEMENTED, "StreamResult not yet implemented");
  }

  Status Health(ServerContext* /*context*/, const HealthRequest* /*request*/,
                HealthResponse* response) override {
    response->set_status(HealthResponse::SERVING_STATUS_SERVING);
    return Status::OK;
  }

 private:
  Status HandleCreateBox(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_box();
    double x = op.x(), y = op.y(), z = op.z();
    double dx = op.dx(), dy = op.dy(), dz = op.dz();

    BRepPrimAPI_MakeBox box(gp_Pnt(x, y, z), dx, dy, dz);
    if (!box.IsDone()) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED,
                        "BRepPrimAPI_MakeBox failed");
    }

    TopoDS_Shape shape = box.Shape();
    if (shape.IsNull()) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY,
                        "Resulting shape is null");
    }

    // Mesh the shape
    BRepMesh_IncrementalMesh mesh(shape, op.deflection());
    if (!mesh.IsDone()) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED,
                        "BRepMesh_IncrementalMesh failed");
    }

    // Store in per-session cache (TopoDS_Shape stored by value)
    std::string shapeId = op.entity_id();
    if (shapeId.empty()) {
      shapeId = "shape_" + std::to_string(g_shapeCache.size());
    }
    g_shapeCache[shapeId] = shape;

    // Build ExecuteSuccess -> BoxResult response
    auto* success = response->mutable_success();
    success->set_shape_id(shapeId);
    auto* boxResult = success->mutable_box();
    boxResult->set_shape_id(shapeId);

    // Optional MeshData (populated later from triangulation)
    if (request->include_brep()) {
      auto* meshData = response->mutable_mesh();
      // TODO: populate MeshData positions/indices from shape triangulation
    }

    return Status::OK;  // gRPC OK; business failures carried in-band via ExecuteFailure
  }

  Status SetFailure(ExecuteResponse* response, ExecutionFailureCode code,
                    const std::string& message) {
    auto* failure = response->mutable_failure();
    failure->set_operation("Execute");
    failure->set_code(static_cast<uint32_t>(code));
    failure->set_message(message);
    return Status::OK;  // gRPC OK with in-band failure code
  }

  // B-rep pre-validation: size and truncation checks before OCCT reader.
  static bool ValidateBRepBytes(const std::string& data, std::string* outReason) {
    if (data.empty()) {
      if (outReason) *outReason = "empty B-rep";
      return false;
    }
    constexpr std::size_t kMaxBrepBytes = 64 * 1024 * 1024;  // 64 MiB
    if (data.size() > kMaxBrepBytes) {
      if (outReason) *outReason = "B-rep too large";
      return false;
    }
    // B-rep binary ends with section terminator 0x1a
    if (static_cast<unsigned char>(data.back()) != 0x1a) {
      if (outReason) *outReason = "truncated B-rep";
      return false;
    }
    return true;
  }

  // Write bytes to a temp file, return the file path.
  static std::string WriteTempFile(const std::string& data) {
    char tmpPath[] = "/tmp/webcad_brep_XXXXXX";
    int fd = mkstemp(tmpPath);
    if (fd < 0) return "";
    std::ofstream out(tmpPath, std::ios::binary);
    out.write(data.data(), static_cast<std::streamsize>(data.size()));
    out.close();
    close(fd);
    return tmpPath;
  }

  // Read a file into a byte vector.
  static std::vector<unsigned char> ReadFileBytes(const std::string& path) {
    std::ifstream in(path, std::ios::binary | std::ios::ate);
    std::vector<unsigned char> buf;
    if (in) {
      auto size = in.tellg();
      buf.resize(static_cast<size_t>(size));
      in.seekg(0, std::ios::beg);
      in.read(reinterpret_cast<char*>(buf.data()), static_cast<std::streamsize>(buf.size()));
    }
    return buf;
  }

  Status HandleImportBRep(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->import_brep();
    std::string entityId = op.entity_id();

    std::string brepData;
    if (op.brep_source_case() == ImportBRepOp::kBrepBytes) {
      brepData = op.brep_bytes();
    } else if (op.brep_source_case() == ImportBRepOp::kBrepRef) {
      // BlobRef import: data would be fetched from gateway via PutBlob stream.
      // For now, reject with a clear message.
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER,
                        "BrepRef import not yet supported; use brep_bytes");
    } else {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER,
                        "No B-rep source provided");
    }

    // Pre-validation before OCCT reader
    std::string rejectReason;
    if (!ValidateBRepBytes(brepData, &rejectReason)) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_IMPORT_FAILED,
                        rejectReason);
    }

    // Write to temp file and read with OCCT BinTools
    std::string tmpPath = WriteTempFile(brepData);
    if (tmpPath.empty()) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_IMPORT_FAILED,
                        "Failed to write temp B-rep file");
    }

    TopoDS_Shape shape;
    try {
      BinTools::Read(tmpPath.c_str(), shape);
    } catch (const Standard_Failure& e) {
      std::remove(tmpPath.c_str());
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_IMPORT_FAILED,
                        std::string("OCCT BinTools::Read failed: ") + e.GetMessageString());
    }
    std::remove(tmpPath.c_str());

    if (shape.IsNull()) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY,
                        "Imported B-rep shape is null");
    }

    // Store in per-session cache
    if (entityId.empty()) {
      entityId = "shape_" + std::to_string(g_shapeCache.size());
    }
    g_shapeCache[entityId] = shape;

    auto* success = response->mutable_success();
    success->set_shape_id(entityId);
    auto* brepRef = response->mutable_brep_ref();
    brepRef->set_format(webcad::engine::v1::BrepReference::FORMAT_BINARY);

    return Status::OK;
  }

  Status HandleExportBRep(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->export_brep();
    const std::string& entityId = op.entity_id();

    auto it = g_shapeCache.find(entityId);
    if (it == g_shapeCache.end()) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_MISSING_ENTITY,
                        "Shape not found in cache: " + entityId);
    }

    // Write shape to temp file with OCCT BinTools
    std::string tmpPath = "/tmp/webcad_brep_export_XXXXXX";
    int fd = mkstemp(tmpPath.data());
    if (fd < 0) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED,
                        "Failed to create temp export file");
    }
    close(fd);

    try {
      BinTools::Write(it->second, tmpPath.c_str());
    } catch (const Standard_Failure& e) {
      std::remove(tmpPath.c_str());
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED,
                        std::string("OCCT BinTools::Write failed: ") + e.GetMessageString());
    }

    // Read back the exported bytes
    auto buf = ReadFileBytes(tmpPath);
    std::remove(tmpPath.c_str());

    if (buf.empty()) {
      return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED,
                        "Exported B-rep is empty");
    }

    auto* success = response->mutable_success();
    success->set_shape_id(entityId);
    auto* brepRef = response->mutable_brep_ref();
    brepRef->set_format(webcad::engine::v1::BrepReference::FORMAT_BINARY);
    brepRef->set_data(buf.data(), buf.size());

    return Status::OK;
  }
};

int main(int argc, char** argv) {
  std::string server_address("unix:///tmp/webcad-kernel.sock");
  if (argc > 1) {
    server_address = std::string("unix://") + argv[1];
  }

  KernelServiceImpl service;

  ServerBuilder builder;
  builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
  builder.RegisterService(&service);

  std::unique_ptr<Server> server(builder.BuildAndStart());
  std::cout << "[Kernel] Listening on " << server_address << std::endl;

  server->Wait();
  return 0;
}