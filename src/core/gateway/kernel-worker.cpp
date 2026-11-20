// Kernel worker: OCCT 7.9.3 wrapped behind gRPC Kernel.Execute over UDS.
// Build: CMakeLists.txt at repo root (OCCT 7.9.3 + protobuf + gRPC).
//
// See docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md
// for architecture, authority model, and error handling.

#include <grpcpp/grpcpp.h>
#include <iostream>
#include <string>
#include <unordered_map>
#include <sstream>
#include <cstdlib>
#include <cctype>
#include <ctime>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>

// Structured logging: timestamped lines to stderr.
// Use LOG(INFO) / LOG(ERROR) / LOG(WARN) / LOG(DEBUG) with stream syntax.
// Controlled by WEBCAD_KERNEL_LOG_LEVEL env var (default: INFO).
enum LogLevel { kLogDebug, kLogInfo, kLogWarn, kLogError };
static LogLevel g_logLevel = kLogInfo;
static std::atomic<bool> g_shutdownRequested{false};

static const char* LevelName(LogLevel l) {
  switch (l) {
    case kLogDebug: return "DEBUG";
    case kLogInfo:  return "INFO";
    case kLogWarn:  return "WARN";
    case kLogError: return "ERROR";
    default:        return "UNKNOWN";
  }
}

#define LOG(level) \
  if (level < g_logLevel) ; \
  else std::cerr << "[" << LevelName(static_cast<LogLevel>(level)) \
                 << "] " << __FILE__ << ":" << __LINE__ << " "

static bool ShouldLog(LogLevel level) { return level >= g_logLevel; }

// Generated C++ protobuf/gRPC stubs from engine.proto (protoc --cpp_out / grpc_cpp_plugin)
#include "webcad/engine/v1/engine.grpc.pb.h"

// OCCT 7.9.3 includes: all public headers live under opencascade/.
// TKernel.hxx and TKBRep.hxx do not exist as headers (they're library names).
// Standard_Exception.hxx does not exist; Standard_Failure is the base exception class.
#include <opencascade/Standard_Failure.hxx>
#include <opencascade/BRepPrimAPI_MakeBox.hxx>
#include <opencascade/BRepPrimAPI_MakeCylinder.hxx>
#include <opencascade/BRepPrimAPI_MakeSphere.hxx>
#include <opencascade/BRepPrimAPI_MakeCone.hxx>
#include <opencascade/BRepPrimAPI_MakeTorus.hxx>
#include <opencascade/BRepPrimAPI_MakeWedge.hxx>
#include <opencascade/BRepPrimAPI_MakePrism.hxx>
#include <opencascade/BRepPrimAPI_MakeRevol.hxx>
#include <opencascade/BRepAlgoAPI_Fuse.hxx>
#include <opencascade/BRepAlgoAPI_Cut.hxx>
#include <opencascade/BRepAlgoAPI_Common.hxx>
#include <opencascade/BRepFilletAPI_MakeFillet.hxx>
#include <opencascade/BRepFilletAPI_MakeChamfer.hxx>
#include <opencascade/BRepOffsetAPI_DraftAngle.hxx>
#include <opencascade/BRepBuilderAPI_MakeWire.hxx>
#include <opencascade/BRepBuilderAPI_MakeEdge.hxx>
#include <opencascade/BRepBuilderAPI_MakeFace.hxx>
#include <opencascade/BRepBuilderAPI_MakeShell.hxx>
#include <opencascade/BRepBuilderAPI_Sewing.hxx>
#include <opencascade/BRepAdaptor_Surface.hxx>
#include <opencascade/Geom_Surface.hxx>
#include <opencascade/Geom_Plane.hxx>
#include <opencascade/Geom_CylindricalSurface.hxx>
#include <opencascade/Geom_ConicalSurface.hxx>
#include <opencascade/Geom_SphericalSurface.hxx>
#include <opencascade/Geom_ToroidalSurface.hxx>
#include <opencascade/Geom_BezierSurface.hxx>
#include <opencascade/Geom_BSplineSurface.hxx>
#include <opencascade/TopExp_Explorer.hxx>
#include <opencascade/TopAbs_ShapeEnum.hxx>
#include <opencascade/BRepGProp.hxx>
#include <opencascade/GProp_GProps.hxx>
#include <opencascade/BRepMesh_IncrementalMesh.hxx>
#include <opencascade/BinTools.hxx>
#include <opencascade/STEPControl_Writer.hxx>
#include <opencascade/Interface_Static.hxx>
#include <opencascade/IFSelect.hxx>
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
using webcad::engine::v1::ImportBRepOp;
using webcad::engine::v1::ExportBRepOp;
using webcad::engine::v1::StepExportOp;
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

static void InitLogLevel() {
  const char* env = std::getenv("WEBCAD_KERNEL_LOG_LEVEL");
  if (env) {
    std::string s(env);
    if (s == "DEBUG") g_logLevel = kLogDebug;
    else if (s == "WARN") g_logLevel = kLogWarn;
    else if (s == "ERROR") g_logLevel = kLogError;
    else g_logLevel = kLogInfo;
  }
}

// ---------------------------------------------------------------------------
// Minimal JSON utilities for CLI mode (no external JSON dependency)
// ---------------------------------------------------------------------------

// Extract a string value for a key from a JSON object line.
// Returns true if found, sets out to the unescaped string value.
static bool JsonGetString(const std::string& json, const std::string& key,
                          std::string* out) {
  std::string search = "\"" + key + "\"";
  size_t pos = json.find(search);
  if (pos == std::string::npos) return false;
  size_t colon = json.find(':', pos + search.size());
  if (colon == std::string::npos) return false;
  size_t valStart = json.find('"', colon + 1);
  if (valStart == std::string::npos) return false;
  size_t valEnd = json.find('"', valStart + 1);
  if (valEnd == std::string::npos) return false;
  *out = json.substr(valStart + 1, valEnd - valStart - 1);
  return true;
}

// Extract a double value for a key from a JSON object line.
static bool JsonGetDouble(const std::string& json, const std::string& key,
                          double* out) {
  std::string search = "\"" + key + "\"";
  size_t pos = json.find(search);
  if (pos == std::string::npos) return false;
  size_t colon = json.find(':', pos + search.size());
  if (colon == std::string::npos) return false;
  size_t valStart = colon + 1;
  while (valStart < json.size() && (json[valStart] == ' ' || json[valStart] == '\t'))
    ++valStart;
  size_t valEnd = valStart;
  while (valEnd < json.size() &&
         (isdigit(static_cast<unsigned char>(json[valEnd])) ||
          json[valEnd] == '.' || json[valEnd] == '-' ||
          json[valEnd] == 'e' || json[valEnd] == 'E' ||
          json[valEnd] == '+'))
    ++valEnd;
  if (valEnd == valStart) return false;
  *out = std::atof(json.substr(valStart, valEnd - valStart).c_str());
  return true;
}

// Extract an int value for a key from a JSON object line.
static bool JsonGetInt(const std::string& json, const std::string& key,
                       int* out) {
  double d;
  if (!JsonGetDouble(json, key, &d)) return false;
  *out = static_cast<int>(d);
  return true;
}

// Check if a key exists in JSON.
static bool JsonHasKey(const std::string& json, const std::string& key) {
  return json.find("\"" + key + "\"") != std::string::npos;
}

// Escape a string for JSON output.
static std::string JsonEscape(const std::string& s) {
  std::string out;
  out.reserve(s.size() + 2);
  for (char c : s) {
    switch (c) {
      case '"':  out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:   out += c; break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// OCCT operation functions (shared by gRPC handlers and CLI mode)
// ---------------------------------------------------------------------------

struct OpResult {
  bool ok = false;
  uint32_t code = 0;   // ExecutionFailureCode
  std::string message;
  std::string shapeId;
  std::string format;  // "BINARY" or "STEP"
  std::string data;    // raw bytes for brep/step export
};

static OpResult OpCreateBox(double x, double y, double z, double dx, double dy,
                            double dz, double deflection,
                            const std::string& entityId) {
  OpResult r;
  BRepPrimAPI_MakeBox box(dx, dy, dz);
  box.Build();
  if (!box.IsDone()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      r.message = "BRepPrimAPI_MakeBox failed: IsDone=0 dx=" + std::to_string(dx) + " dy=" + std::to_string(dy) + " dz=" + std::to_string(dz);
    return r;
  }
  TopoDS_Shape shape = box.Shape();
  if (shape.IsNull()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY);
    r.message = "Resulting shape is null";
    return r;
  }
  BRepMesh_IncrementalMesh mesh(shape, deflection);
  if (!mesh.IsDone()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "BRepMesh_IncrementalMesh failed";
    return r;
  }
  std::string shapeId = entityId.empty() ? "shape_" + std::to_string(g_shapeCache.size()) : entityId;
  g_shapeCache[shapeId] = shape;
  r.ok = true;
  r.shapeId = shapeId;
  return r;
}

static OpResult OpImportBRep(const std::string& brepData, const std::string& entityId) {
  OpResult r;
  if (brepData.empty()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_IMPORT_FAILED);
    r.message = "empty B-rep";
    return r;
  }
  constexpr std::size_t kMaxBrepBytes = 64 * 1024 * 1024;
  if (brepData.size() > kMaxBrepBytes) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_IMPORT_FAILED);
    r.message = "B-rep too large";
    return r;
  }
  if (static_cast<unsigned char>(brepData.back()) != 0x1a) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_IMPORT_FAILED);
    r.message = "truncated B-rep";
    return r;
  }
  char tmpPath[] = "/tmp/webcad_brep_XXXXXX";
  int fd = mkstemp(tmpPath);
  if (fd < 0) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_IMPORT_FAILED);
    r.message = "Failed to write temp B-rep file";
    return r;
  }
  std::ofstream out(tmpPath, std::ios::binary);
  out.write(brepData.data(), static_cast<std::streamsize>(brepData.size()));
  out.close();
  close(fd);

  TopoDS_Shape shape;
  try {
    BinTools::Read(shape, tmpPath);
  } catch (const Standard_Failure& e) {
    std::remove(tmpPath);
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_IMPORT_FAILED);
    r.message = "OCCT BinTools::Read failed: " + std::string(e.GetMessageString());
    return r;
  }
  std::remove(tmpPath);

  if (shape.IsNull()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY);
    r.message = "Imported B-rep shape is null";
    return r;
  }
  std::string shapeId = entityId.empty() ? "shape_" + std::to_string(g_shapeCache.size()) : entityId;
  g_shapeCache[shapeId] = shape;
  r.ok = true;
  r.shapeId = shapeId;
  return r;
}

static OpResult OpExportBRep(const std::string& entityId) {
  OpResult r;
  auto it = g_shapeCache.find(entityId);
  if (it == g_shapeCache.end()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_MISSING_ENTITY);
    r.message = "Shape not found in cache: " + entityId;
    return r;
  }
  char tmpPath[] = "/tmp/webcad_brep_export_XXXXXX";
  int fd = mkstemp(tmpPath);
  if (fd < 0) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED);
    r.message = "Failed to create temp export file";
    return r;
  }
  close(fd);
  try {
    BinTools::Write(it->second, tmpPath);
  } catch (const Standard_Failure& e) {
    std::remove(tmpPath);
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED);
    r.message = "OCCT BinTools::Write failed: " + std::string(e.GetMessageString());
    return r;
  }
  std::ifstream in(tmpPath, std::ios::binary | std::ios::ate);
  std::vector<unsigned char> buf;
  if (in) {
    auto size = in.tellg();
    buf.resize(static_cast<size_t>(size));
    in.seekg(0, std::ios::beg);
    in.read(reinterpret_cast<char*>(buf.data()), static_cast<std::streamsize>(buf.size()));
  }
  std::remove(tmpPath);
  if (buf.empty()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED);
    r.message = "Exported B-rep is empty";
    return r;
  }
  r.ok = true;
  r.shapeId = entityId;
  r.format = "BINARY";
  r.data.assign(buf.begin(), buf.end());
  return r;
}

static OpResult OpStepExport(const std::string& entityId) {
  OpResult r;
  auto it = g_shapeCache.find(entityId);
  if (it == g_shapeCache.end()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_MISSING_ENTITY);
    r.message = "Shape not found in cache: " + entityId;
    return r;
  }
  Interface_Static::SetCVal("write.step.schema", "AP214");
  STEPControl_Writer writer;
  IFSelect_ReturnStatus status = writer.Transfer(it->second, STEPControl_AsIs);
  if (status != IFSelect_RetDone) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED);
    r.message = "OCCT STEPControl_Writer::Transfer failed";
    return r;
  }
  char tmpPath[] = "/tmp/webcad_step_export_XXXXXX";
  int fd = mkstemp(tmpPath);
  if (fd < 0) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED);
    r.message = "Failed to create temp export file";
    return r;
  }
  close(fd);
  try {
    writer.Write(tmpPath);
  } catch (const Standard_Failure& e) {
    std::remove(tmpPath);
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED);
    r.message = "OCCT STEPControl_Writer::Write failed: " + std::string(e.GetMessageString());
    return r;
  }
  std::ifstream in(tmpPath, std::ios::binary | std::ios::ate);
  std::vector<unsigned char> buf;
  if (in) {
    auto size = in.tellg();
    buf.resize(static_cast<size_t>(size));
    in.seekg(0, std::ios::beg);
    in.read(reinterpret_cast<char*>(buf.data()), static_cast<std::streamsize>(buf.size()));
  }
  std::remove(tmpPath);
  if (buf.empty()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED);
    r.message = "Exported STEP file is empty";
    return r;
  }
  r.ok = true;
  r.shapeId = entityId;
  r.format = "STEP";
  r.data.assign(buf.begin(), buf.end());
  return r;
}

static OpResult OpReleaseShapes(const std::vector<std::string>& entityIds) {
  OpResult r;
  r.ok = true;
  int released = 0;
  int notFound = 0;
  for (const auto& id : entityIds) {
    auto it = g_shapeCache.find(id);
    if (it == g_shapeCache.end()) {
      notFound++;
      continue;
    }
    g_shapeCache.erase(it);
    released++;
  }
  if (notFound > 0) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_MISSING_ENTITY);
    r.message = "Released " + std::to_string(released) + " shape(s); "
                + std::to_string(notFound) + " not found";
  } else {
    r.message = "Released " + std::to_string(released) + " shape(s)";
  }
  return r;
}

// CLI mode: read JSON commands from stdin, write JSON responses to stdout.
// Each line is one command: {"op": "create_box", ...}
// Response: {"ok": true, "shape_id": "..."} or {"ok": false, "code": N, "message": "..."}
static void RunCliMode() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.empty()) continue;
    std::string op;
    if (!JsonGetString(line, "op", &op)) {
      std::cout << "{\"ok\": false, \"code\": 3, \"message\": \"Missing 'op' field\"}\n";
      std::cout.flush();
      continue;
    }

    if (op == "create_box") {
      double x = 0, y = 0, z = 0, dx = 0, dy = 0, dz = 0, deflection = 0.1;
      std::string entityId;
      JsonGetDouble(line, "x", &x);
      JsonGetDouble(line, "y", &y);
      JsonGetDouble(line, "z", &z);
      JsonGetDouble(line, "dx", &dx);
      JsonGetDouble(line, "dy", &dy);
      JsonGetDouble(line, "dz", &dz);
      JsonGetDouble(line, "deflection", &deflection);
      JsonGetString(line, "entity_id", &entityId);
      auto r = OpCreateBox(x, y, z, dx, dy, dz, deflection, entityId);
      if (r.ok) {
        std::cout << "{\"ok\": true, \"shape_id\": \"" << JsonEscape(r.shapeId)
                  << "\", \"op\": \"create_box\"}\n";
      } else {
        std::cout << "{\"ok\": false, \"code\": " << r.code
                  << ", \"message\": \"" << JsonEscape(r.message) << "\", \"op\": \"create_box\"}\n";
      }
    } else if (op == "import_brep") {
      std::string brepData, entityId;
      JsonGetString(line, "brep_bytes", &brepData);
      JsonGetString(line, "entity_id", &entityId);
      auto r = OpImportBRep(brepData, entityId);
      if (r.ok) {
        std::cout << "{\"ok\": true, \"shape_id\": \"" << JsonEscape(r.shapeId)
                  << "\", \"op\": \"import_brep\"}\n";
      } else {
        std::cout << "{\"ok\": false, \"code\": " << r.code
                  << ", \"message\": \"" << JsonEscape(r.message) << "\", \"op\": \"import_brep\"}\n";
      }
    } else if (op == "export_brep") {
      std::string entityId;
      JsonGetString(line, "entity_id", &entityId);
      auto r = OpExportBRep(entityId);
      if (r.ok) {
        std::cout << "{\"ok\": true, \"shape_id\": \"" << JsonEscape(r.shapeId)
                  << "\", \"format\": \"" << r.format
                  << "\", \"data_len\": " << r.data.size()
                  << ", \"op\": \"export_brep\"}\n";
      } else {
        std::cout << "{\"ok\": false, \"code\": " << r.code
                  << ", \"message\": \"" << JsonEscape(r.message) << "\", \"op\": \"export_brep\"}\n";
      }
    } else if (op == "step_export") {
      std::string entityId;
      JsonGetString(line, "entity_id", &entityId);
      auto r = OpStepExport(entityId);
      if (r.ok) {
        std::cout << "{\"ok\": true, \"shape_id\": \"" << JsonEscape(r.shapeId)
                  << "\", \"format\": \"" << r.format
                  << "\", \"data_len\": " << r.data.size()
                  << ", \"op\": \"step_export\"}\n";
      } else {
        std::cout << "{\"ok\": false, \"code\": " << r.code
                  << ", \"message\": \"" << JsonEscape(r.message) << "\", \"op\": \"step_export\"}\n";
      }
    } else if (op == "release_shapes") {
      // Parse JSON array of entity_ids: ["shape_1", "shape_2"]
      std::vector<std::string> ids;
      size_t pos = 0;
      while (pos < line.size()) {
        pos = line.find('"', pos);
        if (pos == std::string::npos) break;
        ++pos;
        size_t end = line.find('"', pos);
        if (end == std::string::npos) break;
        ids.push_back(line.substr(pos, end - pos));
        pos = end + 1;
      }
      auto r = OpReleaseShapes(ids);
      if (r.ok) {
        std::cout << "{\"ok\": true, \"message\": \"" << JsonEscape(r.message)
                  << "\", \"op\": \"release_shapes\"}\n";
      } else {
        std::cout << "{\"ok\": false, \"code\": " << r.code
                  << ", \"message\": \"" << JsonEscape(r.message) << "\", \"op\": \"release_shapes\"}\n";
      }
    } else if (op == "health") {
      std::cout << "{\"ok\": true, \"op\": \"health\", \"status\": \"serving\"}\n";
    } else {
      std::cout << "{\"ok\": false, \"code\": 3, \"message\": \"Unknown operation: \"}"
                << JsonEscape(op) << "\", \"op\": \"" << JsonEscape(op) << "\"}\n";
    }
    std::cout.flush();
  }
}

class KernelServiceImpl final : public KernelService::Service {
 public:
  Status Execute(ServerContext* /*context*/, const ExecuteRequest* request,
                 ExecuteResponse* response) override {
    response->mutable_header()->set_request_id(request->header().request_id());

    try {
      switch (request->op_case()) {
        case ExecuteRequest::kCreateBox:
          return HandleCreateBox(request, response);
        case ExecuteRequest::kImportBrep:
          return HandleImportBRep(request, response);
        case ExecuteRequest::kExportBrep:
          return HandleExportBRep(request, response);
        case ExecuteRequest::kStepExport:
          return HandleStepExport(request, response);
        case ExecuteRequest::kReleaseShapes:
          return HandleReleaseShapes(request, response);
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

    auto r = OpCreateBox(x, y, z, dx, dy, dz, op.deflection(), op.entity_id());
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    // Build ExecuteSuccess -> BoxResult response
    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* boxResult = success->mutable_box();
    boxResult->set_shape_id(r.shapeId);

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

    auto r = OpImportBRep(brepData, entityId);
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* brepRef = response->mutable_brep_ref();
    brepRef->set_format(webcad::engine::v1::BrepReference::FORMAT_BINARY);

    return Status::OK;
  }

  Status HandleExportBRep(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->export_brep();
    const std::string& entityId = op.entity_id();

    auto r = OpExportBRep(entityId);
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(entityId);
    auto* brepRef = response->mutable_brep_ref();
    brepRef->set_format(webcad::engine::v1::BrepReference::FORMAT_BINARY);
    brepRef->set_data(r.data.data(), r.data.size());

    return Status::OK;
  }

  Status HandleStepExport(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->step_export();
    const std::string& entityId = op.entity_id();

    auto r = OpStepExport(entityId);
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(entityId);
    auto* brepRef = response->mutable_brep_ref();
    brepRef->set_format(webcad::engine::v1::BrepReference::FORMAT_STEP);
    brepRef->set_data(r.data.data(), r.data.size());

    return Status::OK;
  }

  Status HandleReleaseShapes(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->release_shapes();
    std::vector<std::string> entityIds;
    entityIds.reserve(op.entity_ids_size());
    for (int i = 0; i < op.entity_ids_size(); ++i) {
      entityIds.push_back(op.entity_ids(i));
    }

    auto r = OpReleaseShapes(entityIds);
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id("");
    LOG(kLogInfo) << "release_shapes: " << r.message << std::endl;

    return Status::OK;
  }
};

#ifndef SKIP_MAIN
int main(int argc, char** argv) {
  bool cliMode = false;
  std::string server_address("unix:///tmp/webcad-kernel.sock");

  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--cli") {
      cliMode = true;
    } else if (arg.rfind("unix://", 0) == 0) {
      server_address = arg;
    } else if (arg == "--help" || arg == "-h") {
      std::cout << "Usage: kernel-worker [--cli] [unix:///path/to/socket]\n";
      std::cout << "  --cli   Run in JSON-over-stdio CLI mode (no gRPC)\n";
      return 0;
    }
  }

    InitLogLevel();
    LOG(kLogInfo) << "Kernel worker starting" << std::endl;

    if (cliMode) {
      // JSON-over-stdio CLI mode: read commands from stdin, write responses to stdout.
      // Used for development, debugging, and parity testing without the gateway/gRPC stack.
      RunCliMode();
      return 0;
    }

  KernelServiceImpl service;

  ServerBuilder builder;
  builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
  builder.RegisterService(&service);

  std::unique_ptr<Server> server(builder.BuildAndStart());
  std::cout << "[Kernel] Listening on " << server_address << std::endl;

  // Graceful shutdown on SIGINT/SIGTERM
  std::signal(SIGINT, [](int) { g_shutdownRequested.store(true); });
  std::signal(SIGTERM, [](int) { g_shutdownRequested.store(true); });

  // Blocking wait in a thread; main thread polls shutdown flag.
  std::thread waitThread([&]() { server->Wait(); });
  while (!g_shutdownRequested.load()) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
  LOG(kLogInfo) << "Shutdown requested, stopping gRPC server..." << std::endl;
  server->Shutdown();
  waitThread.join();
  LOG(kLogInfo) << "gRPC server stopped gracefully" << std::endl;
  return 0;
}
#endif  // SKIP_MAIN