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
#include <opencascade/BRepGProp.hxx>
#include <opencascade/BRep_Tool.hxx>
#include <opencascade/Geom_Surface.hxx>
#include <opencascade/Geom_Plane.hxx>
#include <opencascade/Geom_CylindricalSurface.hxx>
#include <opencascade/Geom_ConicalSurface.hxx>
#include <opencascade/Geom_SphericalSurface.hxx>
#include <opencascade/Geom_ToroidalSurface.hxx>
#include <opencascade/Geom_BezierSurface.hxx>
#include <opencascade/Geom_BSplineSurface.hxx>
#include <opencascade/TopExp_Explorer.hxx>
#include <opencascade/TopExp.hxx>
#include <opencascade/TopTools_IndexedMapOfShape.hxx>
#include <opencascade/TopAbs_ShapeEnum.hxx>
#include <opencascade/BRepGProp.hxx>
#include <opencascade/GProp_GProps.hxx>
#include <opencascade/Bnd_Box.hxx>
#include <opencascade/BRepBndLib.hxx>
#include <opencascade/BRepCheck_Analyzer.hxx>
#include <opencascade/BRepMesh_IncrementalMesh.hxx>
#include <opencascade/gp_Trsf.hxx>
#include <opencascade/gp_Vec.hxx>
#include <opencascade/gp_Pnt.hxx>
#include <opencascade/TopoDS.hxx>
#include <opencascade/BRepBuilderAPI_Transform.hxx>
#include <opencascade/BRepBuilderAPI_MakeSolid.hxx>
#include <opencascade/BRepBuilderAPI_MakeVertex.hxx>
#include <opencascade/BRepOffsetAPI_ThruSections.hxx>
#include <opencascade/BinTools.hxx>
#include <opencascade/STEPControl_Writer.hxx>
#include <opencascade/Interface_Static.hxx>
#include <opencascade/IFSelect.hxx>
#include <opencascade/gp_GTrsf.hxx>
#include <opencascade/gp_Dir.hxx>
#include <opencascade/gp_Ax1.hxx>
#include <opencascade/gp_Ax2.hxx>
#include <opencascade/BRepBuilderAPI_GTransform.hxx>
#include <cmath>
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
using webcad::engine::v1::CreatePolyhedronOp;
using webcad::engine::v1::CreateConvexHullOp;
using webcad::engine::v1::PolyhedronFace;
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
  BRepPrimAPI_MakeBox box(gp_Pnt(x, y, z), dx, dy, dz);
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

// Shared helper: mesh + cache a created shape.
static OpResult OpCreateAndCache(const TopoDS_Shape& shape, double deflection,
                                 const std::string& entityId) {
  OpResult r;
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

// Apply translation (x, y, z) to a shape. Returns the original shape if zero translation.
static TopoDS_Shape ApplyTranslation(const TopoDS_Shape& shape, double x, double y, double z) {
  if (x == 0.0 && y == 0.0 && z == 0.0) return shape;
  gp_Trsf trsf;
  trsf.SetTranslation(gp_Vec(x, y, z));
  BRepBuilderAPI_Transform transform(shape, trsf);
  return transform.Shape();
}

static OpResult OpCreateCylinder(double x, double y, double z, double r, double h,
                                 double deflection, const std::string& entityId) {
  OpResult result;
  if (r <= 0.0 || h <= 0.0) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "Cylinder: radius and height must be positive";
    return result;
  }
  TopoDS_Shape shape = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), r, h).Shape();
  shape = ApplyTranslation(shape, x, y, z);
  return OpCreateAndCache(shape, deflection, entityId);
}

static OpResult OpCreateSphere(double x, double y, double z, double r,
                               double deflection, const std::string& entityId) {
  OpResult result;
  if (r <= 0.0) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "Sphere: radius must be positive";
    return result;
  }
  TopoDS_Shape shape = BRepPrimAPI_MakeSphere(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), r).Shape();
  shape = ApplyTranslation(shape, x, y, z);
  return OpCreateAndCache(shape, deflection, entityId);
}

static OpResult OpCreateCone(double x, double y, double z, double r, double h,
                             double deflection, const std::string& entityId) {
  OpResult result;
  if (r <= 0.0 || h <= 0.0) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "Cone: radius and height must be positive";
    return result;
  }
  TopoDS_Shape shape =
      BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), r, 0.0, h).Shape();
  shape = ApplyTranslation(shape, x, y, z);
  return OpCreateAndCache(shape, deflection, entityId);
}

static OpResult OpCreateTorus(double x, double y, double z, double r1, double r2,
                              double deflection, const std::string& entityId) {
  OpResult result;
  if (r1 <= 0.0 || r2 <= 0.0) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "Torus: major and minor radii must be positive";
    return result;
  }
  TopoDS_Shape shape =
      BRepPrimAPI_MakeTorus(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), r1, r2).Shape();
  shape = ApplyTranslation(shape, x, y, z);
  return OpCreateAndCache(shape, deflection, entityId);
}

static OpResult OpCreateFrustum(double x, double y, double z, double r1, double r2, double h,
                                double deflection, const std::string& entityId) {
  OpResult result;
  if (r1 < 0.0 || r2 < 0.0 || h <= 0.0) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "Frustum: radii must be non-negative, height must be positive";
    return result;
  }
  TopoDS_Shape shape;
  if (std::abs(r1 - r2) < 1e-6) {
    // Equal radii -> cylinder
    shape = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), r1, h).Shape();
  } else {
    shape = BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), r1, r2, h).Shape();
  }
  shape = ApplyTranslation(shape, x, y, z);
  return OpCreateAndCache(shape, deflection, entityId);
}

static OpResult OpCreateWedge(double x1, double y1, double z1, double x2, double y2,
                              double height, double ltx, double deflection,
                              const std::string& entityId) {
  OpResult result;
  double dx = std::abs(x2 - x1);
  double dy = std::abs(y2 - y1);
  double dz = std::abs(height);
  if (dx < 1e-10 || dy < 1e-10 || dz < 1e-10) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "Wedge: dimensions must be non-zero";
    return result;
  }
  double ox = std::min(x1, x2);
  double oy = std::min(y1, y2);
  double oz = height >= 0 ? z1 : z1 - dz;
  double altx = std::max(0.0, std::min(dx, ltx));

  // 8 corners of the wedge prismoid
  gp_Pnt pts[8] = {
    gp_Pnt(ox + 0.0,     oy + 0.0,     oz + 0.0),   // 0: Bottom-Front-Left
    gp_Pnt(ox + dx,      oy + 0.0,     oz + 0.0),   // 1: Bottom-Front-Right
    gp_Pnt(ox + dx,      oy + dy,      oz + 0.0),   // 2: Bottom-Back-Right
    gp_Pnt(ox + 0.0,     oy + dy,      oz + 0.0),   // 3: Bottom-Back-Left
    gp_Pnt(ox + 0.0,     oy + 0.0,     oz + dz),    // 4: Top-Front-Left
    gp_Pnt(ox + altx,    oy + 0.0,     oz + dz),    // 5: Top-Front-Right
    gp_Pnt(ox + altx,    oy + dy,      oz + dz),    // 6: Top-Back-Right
    gp_Pnt(ox + 0.0,     oy + dy,      oz + dz)     // 7: Top-Back-Left
  };

  int faceIdxs[6][4] = {
    {3, 2, 1, 0}, // Bottom
    {4, 5, 6, 7}, // Top
    {0, 1, 5, 4}, // Front
    {1, 2, 6, 5}, // Right
    {2, 3, 7, 6}, // Back
    {3, 0, 4, 7}  // Left
  };

  BRepBuilderAPI_Sewing sewing(1e-4);

  for (int i = 0; i < 6; ++i) {
    BRepBuilderAPI_MakeWire wire;
    for (int j = 0; j < 4; ++j) {
      const gp_Pnt& p1 = pts[faceIdxs[i][j]];
      const gp_Pnt& p2 = pts[faceIdxs[i][(j + 1) % 4]];
      BRepBuilderAPI_MakeEdge edge(p1, p2);
      if (edge.IsDone()) {
        wire.Add(edge.Edge());
      }
    }
    if (!wire.IsDone()) {
      result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      result.message = "Wedge: failed to build face wire";
      return result;
    }
    BRepBuilderAPI_MakeFace face(wire.Wire(), false);
    if (!face.IsDone()) {
      result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      result.message = "Wedge: failed to build face";
      return result;
    }
    sewing.Add(face.Face());
  }

  sewing.Perform();
  TopoDS_Shape sewed = sewing.SewedShape();

  BRepBuilderAPI_MakeSolid makeSolid;
  TopExp_Explorer exp(sewed, TopAbs_SHELL, TopAbs_SHAPE);
  while (exp.More()) {
    makeSolid.Add(TopoDS::Shell(exp.Current()));
    exp.Next();
  }
  if (!makeSolid.IsDone()) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    result.message = "Wedge: failed to build solid";
    return result;
  }

  TopoDS_Shape shape = makeSolid.Solid();
  shape = ApplyTranslation(shape, x1, y1, z1);
  return OpCreateAndCache(shape, deflection, entityId);
}

static OpResult OpCreatePyramid(double x, double y, double z, int sides, double radius,
                                double h, double deflection, const std::string& entityId) {
  OpResult result;
  if (sides < 3) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "Pyramid: sides must be >= 3";
    return result;
  }
  if (radius <= 0.0 || h <= 0.0) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "Pyramid: radius and height must be positive";
    return result;
  }

  // Build base polygon wire
  BRepBuilderAPI_MakeWire wire;
  std::vector<gp_Pnt> basePts;
  basePts.reserve(sides);
  for (int i = 0; i < sides; ++i) {
    double ang = (static_cast<double>(i) / static_cast<double>(sides)) * 2.0 * M_PI;
    basePts.emplace_back(radius * std::cos(ang), radius * std::sin(ang), 0.0);
  }
  for (int i = 0; i < sides; ++i) {
    BRepBuilderAPI_MakeEdge edge(basePts[i], basePts[(i + 1) % sides]);
    if (!edge.IsDone()) {
      result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      result.message = "Pyramid: failed to build base edge";
      return result;
    }
    wire.Add(edge.Edge());
  }
  if (!wire.IsDone()) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    result.message = "Pyramid: failed to build base wire";
    return result;
  }

  // Apex vertex
  gp_Pnt apexPnt(0.0, 0.0, h);
  BRepBuilderAPI_MakeVertex makeVertex(apexPnt);
  TopoDS_Shape apexVertex = makeVertex.Vertex();

  // Loft between wire and vertex
  BRepOffsetAPI_ThruSections loft(true, true, 1e-6);
  loft.AddWire(wire.Wire());
  loft.AddVertex(TopoDS::Vertex(apexVertex));
  loft.Build();
  if (!loft.IsDone()) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    result.message = "Pyramid: ThruSections build failed";
    return result;
  }

  TopoDS_Shape shape = loft.Shape();
  shape = ApplyTranslation(shape, x, y, z);
  return OpCreateAndCache(shape, deflection, entityId);
}

// Orient all faces of a sewed shell to point outward relative to the shape centroid.
// Ensures the solid has positive volume by reversing all face orientations
// if BRepGProp reports negative mass. In OCCT, TopoDS_Shape::Reverse() flips
// the orientation flag which propagates to all contained sub-shapes (faces),
// effectively flipping every face normal. This is far more reliable than
// per-face BRepTools::ReShape replacement which doesn't propagate through solids.
static void EnsurePositiveVolume(TopoDS_Shape& shape) {
  GProp_GProps vProps;
  BRepGProp::VolumeProperties(shape, vProps);
  if (vProps.Mass() < 0.0) {
    shape.Reverse();
  }
}

static TopoDS_Shape ApplyTransform(const TopoDS_Shape& shape,
                                   const gp_Trsf& trsf,
                                   bool copy = true) {
  BRepBuilderAPI_Transform transformer(shape, trsf, copy);
  return transformer.Shape();
}

static TopoDS_Shape ApplyTransform(const TopoDS_Shape& shape,
                                   const gp_GTrsf& gtrsf,
                                   bool copy = true) {
  BRepBuilderAPI_GTransform transformer(shape, gtrsf, copy);
  return transformer.Shape();
}

// Build a polyhedron from points + face vertex-index lists.
// Port of WASM createPolyhedron (OCCWorker.ts): MakeWire → MakeFace → Sewing → MakeSolid.
// Points are already in world space; no translation is applied.
// Sewing tolerance cascades 1e-4 → 1e-3 → 1e-2 → 1e-1 for robustness.
static OpResult OpCreatePolyhedron(const std::vector<std::array<double, 3>>& points,
                                   const std::vector<std::vector<int>>& faces,
                                   double deflection,
                                   const std::string& entityId) {
  OpResult r;
  if (points.empty()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "Polyhedron: points array is empty";
    return r;
  }
  if (faces.empty()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "Polyhedron: faces array is empty";
    return r;
  }

  // Build a vertex for each point.
  std::vector<TopoDS_Vertex> vertices;
  vertices.reserve(points.size());
  for (const auto& p : points) {
    BRepBuilderAPI_MakeVertex makeVertex(gp_Pnt(p[0], p[1], p[2]));
    if (!makeVertex.IsDone()) {
      r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      r.message = "Polyhedron: failed to create vertex";
      return r;
    }
    vertices.push_back(makeVertex.Vertex());
  }

  // Compute centroid of all points (orientation-independent reference for face normal direction).
  double cx = 0, cy = 0, cz = 0;
  for (const auto& p : points) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  const gp_Pnt centroid(cx / points.size(), cy / points.size(), cz / points.size());

  // Helper: build an oriented face from vertex indices.
  // The face normal is checked against the centroid direction; if it points inward,
  // the face is rebuilt with reversed vertex order (Reverse() on a copy doesn't
  // propagate in OCCT since orientation lives in the shape wrapper, not the TShape).
  auto buildOrientedFace = [&](const std::vector<int>& faceIdxs) -> TopoDS_Face {
    auto buildFaceFromOrder = [&](bool forward) -> TopoDS_Face {
      BRepBuilderAPI_MakeWire wire;
      if (forward) {
        for (size_t i = 0; i < faceIdxs.size(); ++i) {
          int idx1 = faceIdxs[i];
          int idx2 = faceIdxs[(i + 1) % faceIdxs.size()];
          BRepBuilderAPI_MakeEdge edge(vertices[idx1], vertices[idx2]);
          wire.Add(edge.Edge());
        }
      } else {
        for (size_t i = faceIdxs.size(); i > 0; --i) {
          int idx1 = faceIdxs[i - 1];
          int idx2 = faceIdxs[(i - 2 + faceIdxs.size()) % faceIdxs.size()];
          BRepBuilderAPI_MakeEdge edge(vertices[idx1], vertices[idx2]);
          wire.Add(edge.Edge());
        }
      }
      BRepBuilderAPI_MakeFace face(wire.Wire(), false);
      return face.Face();
    };

    TopoDS_Face f = buildFaceFromOrder(true);

    // Check orientation: compute normal at face midpoint, compare to centroid direction.
    BRepAdaptor_Surface surf(f);
    double um = (surf.FirstUParameter() + surf.LastUParameter()) * 0.5;
    double vm = (surf.FirstVParameter() + surf.LastVParameter()) * 0.5;
    gp_Pnt p;
    gp_Vec d1u, d1v;
    surf.D1(um, vm, p, d1u, d1v);
    gp_Vec normal = d1u.Crossed(d1v);
    gp_Vec toCenter(p, centroid);

    // If normal points toward centroid, face is inside-out → rebuild with reversed winding.
    if (normal.Dot(toCenter) > 0.0) {
      f = buildFaceFromOrder(false);
    }
    return f;
  };

  // Sewing with tolerance cascade: 1e-4 → 1e-3 → 1e-2 → 1e-1
  double sewTols[] = {1e-4, 1e-3, 1e-2, 1e-1};
  TopoDS_Shape sewed;
  bool sewnOk = false;
  for (double tol : sewTols) {
    BRepBuilderAPI_Sewing sew(tol);
    for (const auto& faceIdxs : faces) {
      if (faceIdxs.size() < 3) {
        r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
        r.message = "Polyhedron: face with < 3 vertices";
        return r;
      }
      // Validate vertex indices before building.
      bool indicesValid = true;
      for (int idx : faceIdxs) {
        if (idx < 0 || idx >= static_cast<int>(vertices.size())) {
          indicesValid = false;
          break;
        }
      }
      if (!indicesValid) {
        r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
        r.message = "Polyhedron: face vertex index out of range";
        return r;
      }
      TopoDS_Face f = buildOrientedFace(faceIdxs);
      sew.Add(f);
    }
    sew.Perform();
    TopoDS_Shape candidate = sew.SewedShape();
    if (!candidate.IsNull()) {
      sewed = candidate;
      sewnOk = true;
      break;
    }
  }

  if (!sewnOk || sewed.IsNull()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "Polyhedron: sewing failed at all tolerance levels";
    return r;
  }

  BRepBuilderAPI_MakeSolid makeSolid;
  TopExp_Explorer exp(sewed, TopAbs_SHELL, TopAbs_SHAPE);
  while (exp.More()) {
    makeSolid.Add(TopoDS::Shell(exp.Current()));
    exp.Next();
  }
  if (!makeSolid.IsDone()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "Polyhedron: failed to build solid from sewed shell";
    return r;
  }

  TopoDS_Shape shape = makeSolid.Solid();

  // Ensure positive volume by reversing all face orientations if needed.
  EnsurePositiveVolume(shape);

  return OpCreateAndCache(shape, deflection, entityId);
}

// Port of WASM computeConvexHull3D (OCCWorker.ts lines ~4683-4849).
// Incremental 3D convex hull using horizon-edge insertion and interior centroid reference.
static std::vector<std::vector<int>> computeConvexHull3D(
    const std::vector<std::array<double, 3>>& pts) {
  if (pts.size() < 4) {
    return {};
  }

  // Jitter points slightly to prevent coplanar/collinear degeneracies.
  // We use deterministic micro-jitter per point based on index.
  std::vector<std::array<double, 3>> points = pts;
  for (size_t i = 0; i < points.size(); ++i) {
    double jx = std::sin(static_cast<double>(i + 1) * 1.7) * 1e-8;
    double jy = std::sin(static_cast<double>(i + 1) * 3.1) * 1e-8;
    double jz = std::sin(static_cast<double>(i + 1) * 5.3) * 1e-8;
    points[i][0] += jx;
    points[i][1] += jy;
    points[i][2] += jz;
  }

  struct Plane3D {
    double nx = 0.0, ny = 0.0, nz = 0.0;
    double offset = 0.0;
  };

  auto getSignedDistance = [](const Plane3D& plane, const std::array<double, 3>& p) -> double {
    return plane.nx * p[0] + plane.ny * p[1] + plane.nz * p[2] - plane.offset;
  };

  auto makePlane = [&](size_t idx0, size_t idx1, size_t idx2) -> Plane3D {
    const auto& p0 = points[idx0];
    const auto& p1 = points[idx1];
    const auto& p2 = points[idx2];
    double ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    double vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    double nx = uy * vz - uz * vy;
    double ny = uz * vx - ux * vz;
    double nz = ux * vy - uy * vx;
    double len = std::sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-15) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    double offset = nx * p0[0] + ny * p0[1] + nz * p0[2];
    return {nx, ny, nz, offset};
  };

  // 1. i0 = leftmost point (min x)
  size_t i0 = 0;
  for (size_t i = 1; i < points.size(); ++i) {
    if (points[i][0] < points[i0][0]) i0 = i;
  }

  // 2. i1 = point farthest from i0
  size_t i1 = 0;
  double maxDistSq = -1.0;
  for (size_t i = 0; i < points.size(); ++i) {
    if (i == i0) continue;
    double dx = points[i][0] - points[i0][0];
    double dy = points[i][1] - points[i0][1];
    double dz = points[i][2] - points[i0][2];
    double dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxDistSq) {
      maxDistSq = dSq;
      i1 = i;
    }
  }

  // 3. i2 = point farthest from line (i0, i1)
  size_t i2 = static_cast<size_t>(-1);
  double maxLineDistSq = -1.0;
  const auto& p0 = points[i0];
  const auto& p1 = points[i1];
  double ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  double uLenSq = ux * ux + uy * uy + uz * uz;
  if (uLenSq < 1e-15) return {};

  for (size_t i = 0; i < points.size(); ++i) {
    if (i == i0 || i == i1) continue;
    double px = points[i][0] - p0[0], py = points[i][1] - p0[1], pz = points[i][2] - p0[2];
    double t = (px * ux + py * uy + pz * uz) / uLenSq;
    double dx = px - t * ux;
    double dy = py - t * uy;
    double dz = pz - t * uz;
    double dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxLineDistSq) {
      maxLineDistSq = dSq;
      i2 = i;
    }
  }

  // 4. i3 = point farthest from plane (i0, i1, i2)
  size_t i3 = static_cast<size_t>(-1);
  double maxPlaneDist = -1.0;
  Plane3D basePlane = makePlane(i0, i1, i2);
  for (size_t i = 0; i < points.size(); ++i) {
    if (i == i0 || i == i1 || i == i2) continue;
    double dist = std::abs(getSignedDistance(basePlane, points[i]));
    if (dist > maxPlaneDist) {
      maxPlaneDist = dist;
      i3 = i;
    }
  }

  if (i2 == static_cast<size_t>(-1) || i3 == static_cast<size_t>(-1) || maxPlaneDist < 1e-9) {
    return {};  // Collinear or coplanar points
  }

  double cx = (points[i0][0] + points[i1][0] + points[i2][0] + points[i3][0]) / 4.0;
  double cy = (points[i0][1] + points[i1][1] + points[i2][1] + points[i3][1]) / 4.0;
  double cz = (points[i0][2] + points[i1][2] + points[i2][2] + points[i3][2]) / 4.0;
  std::array<double, 3> center = {cx, cy, cz};

  struct Face {
    std::array<int, 3> v;
    Plane3D plane;
  };

  auto createFace = [&](size_t v0, size_t v1, size_t v2) -> Face {
    Plane3D plane = makePlane(v0, v1, v2);
    if (getSignedDistance(plane, center) > 0.0) {
      plane.nx = -plane.nx;
      plane.ny = -plane.ny;
      plane.nz = -plane.nz;
      plane.offset = -plane.offset;
      return {{static_cast<int>(v2), static_cast<int>(v1), static_cast<int>(v0)}, plane};
    }
    return {{static_cast<int>(v0), static_cast<int>(v1), static_cast<int>(v2)}, plane};
  };

  std::vector<Face> faces;
  faces.push_back(createFace(i0, i1, i2));
  faces.push_back(createFace(i0, i2, i3));
  faces.push_back(createFace(i0, i3, i1));
  faces.push_back(createFace(i1, i3, i2));

  std::vector<bool> processed(points.size(), false);
  processed[i0] = true;
  processed[i1] = true;
  processed[i2] = true;
  processed[i3] = true;

  for (size_t i = 0; i < points.size(); ++i) {
    if (processed[i]) continue;
    const auto& pt = points[i];

    std::vector<size_t> visible;
    for (size_t f = 0; f < faces.size(); ++f) {
      if (getSignedDistance(faces[f].plane, pt) > 1e-9) {
        visible.push_back(f);
      }
    }

    if (visible.empty()) continue;

    struct EdgeEntry {
      int v1 = 0, v2 = 0;
      int count = 0;
    };
    std::unordered_map<std::string, EdgeEntry> edgeCounts;

    for (size_t fIdx : visible) {
      const auto& f = faces[fIdx];
      for (int j = 0; j < 3; ++j) {
        int v1 = f.v[j];
        int v2 = f.v[(j + 1) % 3];
        std::string key = std::to_string(v1) + "-" + std::to_string(v2);
        std::string keyRev = std::to_string(v2) + "-" + std::to_string(v1);
        auto itRev = edgeCounts.find(keyRev);
        if (itRev != edgeCounts.end()) {
          itRev->second.count++;
        } else {
          auto itKey = edgeCounts.find(key);
          if (itKey != edgeCounts.end()) {
            itKey->second.count++;
          } else {
            edgeCounts[key] = {v1, v2, 1};
          }
        }
      }
    }

    std::vector<std::pair<int, int>> horizon;
    for (const auto& kv : edgeCounts) {
      if (kv.second.count == 1) {
        horizon.push_back({kv.second.v1, kv.second.v2});
      }
    }

    std::vector<bool> isVisible(faces.size(), false);
    for (size_t vIdx : visible) {
      isVisible[vIdx] = true;
    }

    std::vector<Face> remainingFaces;
    remainingFaces.reserve(faces.size() - visible.size() + horizon.size());
    for (size_t fi = 0; fi < faces.size(); ++fi) {
      if (!isVisible[fi]) {
        remainingFaces.push_back(faces[fi]);
      }
    }

    for (const auto& edge : horizon) {
      remainingFaces.push_back(createFace(edge.first, edge.second, i));
    }

    faces = std::move(remainingFaces);
  }

  std::vector<std::vector<int>> result;
  result.reserve(faces.size());
  for (const auto& f : faces) {
    result.push_back({f.v[0], f.v[1], f.v[2]});
  }
  return result;
}

static OpResult OpCreateConvexHull(const std::vector<std::array<double, 3>>& points,
                                   double deflection,
                                   const std::string& entityId) {
  OpResult r;
  if (points.size() < 4) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "ConvexHull: need at least 4 points";
    return r;
  }

  auto hullFaces = computeConvexHull3D(points);
  if (hullFaces.empty()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "ConvexHull: failed to compute hull (degenerate points)";
    return r;
  }

  return OpCreatePolyhedron(points, hullFaces, deflection, entityId);
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

// Compute geometric + topological metrics for a CAD shape and populate a
// ShapeMetrics protobuf message. Safe for null shapes (sets is_valid=false).
static void ComputeShapeMetrics(const TopoDS_Shape& shape,
                                webcad::engine::v1::ShapeMetrics* metrics) {
  if (!metrics || shape.IsNull()) {
    if (metrics) metrics->set_is_valid(false);
    return;
  }

  // 1. Volume
  GProp_GProps vProps;
  BRepGProp::VolumeProperties(shape, vProps);
  metrics->set_volume(vProps.Mass());

  // 2. Surface area
  GProp_GProps sProps;
  BRepGProp::SurfaceProperties(shape, sProps);
  metrics->set_surface_area(sProps.Mass());

  // 3. Bounding box
  Bnd_Box bndBox;
  BRepBndLib::Add(shape, bndBox);
  if (!bndBox.IsVoid()) {
    double xmin, ymin, zmin, xmax, ymax, zmax;
    bndBox.Get(xmin, ymin, zmin, xmax, ymax, zmax);
    auto* bbox = metrics->mutable_bbox();
    bbox->set_min_x(xmin);
    bbox->set_min_y(ymin);
    bbox->set_min_z(zmin);
    bbox->set_max_x(xmax);
    bbox->set_max_y(ymax);
    bbox->set_max_z(zmax);
  }

  // 4. Topology counts
  TopTools_IndexedMapOfShape fMap, eMap, vMap;
  TopExp::MapShapes(shape, TopAbs_FACE, fMap);
  TopExp::MapShapes(shape, TopAbs_EDGE, eMap);
  TopExp::MapShapes(shape, TopAbs_VERTEX, vMap);

  metrics->set_face_count(static_cast<uint32_t>(fMap.Extent()));
  metrics->set_edge_count(static_cast<uint32_t>(eMap.Extent()));
  metrics->set_vertex_count(static_cast<uint32_t>(vMap.Extent()));

  // 5. Validity
  BRepCheck_Analyzer analyzer(shape);
  metrics->set_is_valid(analyzer.IsValid());
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

// Stdio mode: read length-prefixed JSON commands from stdin, write length-prefixed JSON responses to stdout.
// Framing: 4-byte big-endian uint32 length prefix + JSON body. Matches StdioKernelClient on the gateway side.
static void RunStdioMode() {
  while (true) {
    // Read 4-byte length prefix
    uint32_t length = 0;
    if (!std::cin.read(reinterpret_cast<char*>(&length), 4)) break;

    // Read JSON body
    std::string body(length, '\0');
    if (!std::cin.read(&body[0], static_cast<std::streamsize>(length))) break;

    // Parse op from JSON body (minimal parse, same command set as CLI mode)
    std::string op;
    if (!JsonGetString(body, "op", &op)) {
      std::string resp = "{\"ok\": false, \"code\": 3, \"message\": \"Missing 'op' field\"}";
      uint32_t respLen = static_cast<uint32_t>(resp.size());
      std::cout.write(reinterpret_cast<const char*>(&respLen), 4);
      std::cout.write(resp.data(), respLen);
      std::cout.flush();
      continue;
    }

    if (op == "health") {
      std::string resp = "{\"ok\": true, \"op\": \"health\", \"status\": \"serving\"}";
      uint32_t respLen = static_cast<uint32_t>(resp.size());
      std::cout.write(reinterpret_cast<const char*>(&respLen), 4);
      std::cout.write(resp.data(), respLen);
      std::cout.flush();
      continue;
    }

    // Unknown op
    std::string resp = "{\"ok\": false, \"code\": 3, \"message\": \"Unknown operation: \"}" + JsonEscape(op) + "\"}";
    uint32_t respLen = static_cast<uint32_t>(resp.size());
    std::cout.write(reinterpret_cast<const char*>(&respLen), 4);
    std::cout.write(resp.data(), respLen);
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
        case ExecuteRequest::kInit:
          return HandleInit(request, response);
        case ExecuteRequest::kClearCache:
          return HandleClearCache(request, response);
        case ExecuteRequest::kCreateBox:
          return HandleCreateBox(request, response);
        case ExecuteRequest::kCreateCylinder:
          return HandleCreateCylinder(request, response);
        case ExecuteRequest::kCreateFrustum:
          return HandleCreateFrustum(request, response);
        case ExecuteRequest::kCreateSphere:
          return HandleCreateSphere(request, response);
        case ExecuteRequest::kCreateCone:
          return HandleCreateCone(request, response);
        case ExecuteRequest::kCreateTorus:
          return HandleCreateTorus(request, response);
        case ExecuteRequest::kCreateWedge:
          return HandleCreateWedge(request, response);
        case ExecuteRequest::kCreatePyramid:
          return HandleCreatePyramid(request, response);
        case ExecuteRequest::kCreatePolyhedron:
          return HandleCreatePolyhedron(request, response);
        case ExecuteRequest::kCreateConvexHull:
          return HandleCreateConvexHull(request, response);
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
  Status HandleInit(const ExecuteRequest* /*request*/, ExecuteResponse* response) {
    auto* success = response->mutable_success();
    success->set_shape_id("");
    return Status::OK;
  }

  Status HandleClearCache(const ExecuteRequest* /*request*/, ExecuteResponse* response) {
    g_shapeCache.clear();
    auto* success = response->mutable_success();
    success->set_shape_id("");
    return Status::OK;
  }

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

    // Compute and attach shape metrics for parity harness
    auto it = g_shapeCache.find(r.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    // Optional MeshData (populated later from triangulation)
    if (request->include_brep()) {
      auto* meshData = response->mutable_mesh();
      // TODO: populate MeshData positions/indices from shape triangulation
    }

    return Status::OK;  // gRPC OK; business failures carried in-band via ExecuteFailure
  }

  Status HandleCreateCylinder(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_cylinder();
    double x = op.x(), y = op.y(), z = op.z();
    double r = op.r(), h = op.h();

    auto result = OpCreateCylinder(x, y, z, r, h, op.deflection(), op.entity_id());
    if (!result.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(result.code), result.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(result.shapeId);
    auto* cylResult = success->mutable_cylinder();
    cylResult->set_shape_id(result.shapeId);

    auto it = g_shapeCache.find(result.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
  }

  Status HandleCreateSphere(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_sphere();
    double x = op.x(), y = op.y(), z = op.z();
    double r = op.r();

    auto result = OpCreateSphere(x, y, z, r, op.deflection(), op.entity_id());
    if (!result.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(result.code), result.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(result.shapeId);
    auto* sphResult = success->mutable_sphere();
    sphResult->set_shape_id(result.shapeId);

    auto it = g_shapeCache.find(result.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
  }

  Status HandleCreateCone(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_cone();
    double x = op.x(), y = op.y(), z = op.z();
    double r = op.r(), h = op.h();

    auto result = OpCreateCone(x, y, z, r, h, op.deflection(), op.entity_id());
    if (!result.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(result.code), result.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(result.shapeId);
    auto* coneResult = success->mutable_cone();
    coneResult->set_shape_id(result.shapeId);

    auto it = g_shapeCache.find(result.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
  }

  Status HandleCreateTorus(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_torus();
    double x = op.x(), y = op.y(), z = op.z();
    double r1 = op.r1(), r2 = op.r2();

    auto r = OpCreateTorus(x, y, z, r1, r2, op.deflection(), op.entity_id());
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* torusResult = success->mutable_torus();
    torusResult->set_shape_id(r.shapeId);

    auto it = g_shapeCache.find(r.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
  }

  Status HandleCreateFrustum(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_frustum();
    double x = op.x(), y = op.y(), z = op.z();
    double r1 = op.r1(), r2 = op.r2(), h = op.h();

    auto r = OpCreateFrustum(x, y, z, r1, r2, h, op.deflection(), op.entity_id());
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* frustResult = success->mutable_frustum();
    frustResult->set_shape_id(r.shapeId);

    auto it = g_shapeCache.find(r.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
  }

  Status HandleCreateWedge(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_wedge();
    double x1 = op.x1(), y1 = op.y1(), z1 = op.z1();
    double x2 = op.x2(), y2 = op.y2(), height = op.height();
    double ltx = op.ltx();

    auto r = OpCreateWedge(x1, y1, z1, x2, y2, height, ltx, op.deflection(), op.entity_id());
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* wedgeResult = success->mutable_wedge();
    wedgeResult->set_shape_id(r.shapeId);

    auto it = g_shapeCache.find(r.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
  }

  Status HandleCreatePyramid(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_pyramid();
    double x = op.x(), y = op.y(), z = op.z();
    int sides = op.sides();
    double radius = op.radius(), h = op.h();

    auto r = OpCreatePyramid(x, y, z, sides, radius, h, op.deflection(), op.entity_id());
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* pyrResult = success->mutable_pyramid();
    pyrResult->set_shape_id(r.shapeId);

    auto it = g_shapeCache.find(r.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
  }

  Status HandleCreatePolyhedron(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_polyhedron();
    double deflection = op.deflection();
    std::string entityId = op.entity_id();

    std::vector<std::array<double, 3>> points;
    points.reserve(op.points_inline_size());
    for (int i = 0; i < op.points_inline_size(); ++i) {
      points.push_back({op.points_inline(i).x(), op.points_inline(i).y(), op.points_inline(i).z()});
    }

    std::vector<std::vector<int>> faces;
    faces.reserve(op.faces_size());
    for (int i = 0; i < op.faces_size(); ++i) {
      const auto& f = op.faces(i);
      std::vector<int> faceIdxs;
      faceIdxs.reserve(f.vertex_indices_size());
      for (int j = 0; j < f.vertex_indices_size(); ++j) {
        faceIdxs.push_back(f.vertex_indices(j));
      }
      faces.push_back(faceIdxs);
    }

    auto r = OpCreatePolyhedron(points, faces, deflection, entityId);
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* polyResult = success->mutable_polyhedron();
    polyResult->set_shape_id(r.shapeId);

    auto it = g_shapeCache.find(r.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
  }

  Status HandleCreateConvexHull(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_convex_hull();
    double deflection = op.deflection();
    std::string entityId = op.entity_id();

    std::vector<std::array<double, 3>> points;
    points.reserve(op.points_inline_size());
    for (int i = 0; i < op.points_inline_size(); ++i) {
      points.push_back({op.points_inline(i).x(), op.points_inline(i).y(), op.points_inline(i).z()});
    }

    auto r = OpCreateConvexHull(points, deflection, entityId);
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* hullResult = success->mutable_convex_hull();
    hullResult->set_shape_id(r.shapeId);

    auto it = g_shapeCache.find(r.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
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

  // KERNEL_TRANSPORT=stdio enables length-prefixed JSON over stdin/stdout
  // (used by the gateway's StdioKernelClient).
  const char* transportEnv = std::getenv("KERNEL_TRANSPORT");
  bool useStdio = transportEnv && std::string(transportEnv) == "stdio";

  InitLogLevel();
  LOG(kLogInfo) << "Kernel worker starting" << std::endl;

  if (useStdio) {
    // Length-prefixed JSON over stdio: skip UDS/gRPC entirely.
    RunStdioMode();
    return 0;
  }

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