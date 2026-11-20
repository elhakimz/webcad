// C++ codec round-trip tests for the language-neutral kernel protocol.
// Mirrors src/core/io/__tests__/codec.test.ts (TS side of WC-EC-09).
//
// Build: added as `codec_test` target in kernel/CMakeLists.txt
// Run:   ./build/codec_test  or  ctest --test-dir build -R codec_test

#include <gtest/gtest.h>

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <fstream>
#include <filesystem>
#include <map>
#include <cctype>

#include "webcad/engine/v1/common.pb.h"

using webcad::engine::v1::CommandHeader;
using webcad::engine::v1::MeshData;
using webcad::engine::v1::ExecuteFailure;
using webcad::engine::v1::ExecutionFailureCode;

// Helper: serialize then deserialize a protobuf message, return decoded copy.
// No ASSERT inside (gtest ASSERT macros return void, incompatible with value-returning fn).
template <typename T>
static T roundTrip(const T& msg) {
  std::string binary;
  msg.SerializeToString(&binary);
  T decoded;
  decoded.ParseFromString(binary);
  return decoded;
}

// ---------------------------------------------------------------------------
// CommandHeader
// ---------------------------------------------------------------------------

TEST(CodecTest, CommandHeaderRoundTripAllFields) {
  CommandHeader input;
  input.set_session_id("sess-123");
  input.set_request_id("req-456");
  input.set_client_seq(7);
  input.set_document_id("doc-789");

  auto output = roundTrip(input);
  EXPECT_EQ(output.session_id(), "sess-123");
  EXPECT_EQ(output.request_id(), "req-456");
  EXPECT_EQ(output.client_seq(), 7);
  EXPECT_EQ(output.document_id(), "doc-789");
}

TEST(CodecTest, CommandHeaderRoundTripEmptyFields) {
  CommandHeader input;
  input.set_session_id("");
  input.set_request_id("");
  input.set_client_seq(1);
  input.set_document_id("");

  auto output = roundTrip(input);
  EXPECT_EQ(output.client_seq(), 1);
  EXPECT_TRUE(output.session_id().empty());
  EXPECT_TRUE(output.request_id().empty());
  EXPECT_TRUE(output.document_id().empty());
}

TEST(CodecTest, CommandHeaderLargeClientSeq) {
  CommandHeader input;
  input.set_client_seq(18446744073709551615ULL);  // max uint64

  auto output = roundTrip(input);
  EXPECT_EQ(output.client_seq(), 18446744073709551615ULL);
}

// ---------------------------------------------------------------------------
// OpenSessionRequest / OpenSessionResponse (engine.proto)
// ---------------------------------------------------------------------------

#include "webcad/engine/v1/engine.pb.h"

using webcad::engine::v1::OpenSessionRequest;
using webcad::engine::v1::OpenSessionResponse;
using webcad::engine::v1::ServerLimits;

TEST(CodecTest, OpenSessionRequestRoundTrip) {
  OpenSessionRequest input;
  input.mutable_header()->set_session_id("sess-1");
  input.mutable_header()->set_request_id("req-1");
  input.mutable_header()->set_client_seq(1);
  input.mutable_header()->set_document_id("");
  input.set_client_version("0.1.0");
  input.set_include_brep(true);

  auto output = roundTrip(input);
  EXPECT_EQ(output.header().session_id(), "sess-1");
  EXPECT_EQ(output.client_version(), "0.1.0");
  EXPECT_TRUE(output.include_brep());
}

TEST(CodecTest, OpenSessionResponseRoundTrip) {
  OpenSessionResponse input;
  input.set_protocol_version("1.0");
  input.set_minimum_client_version("0.1.0");
  input.set_heartbeat_interval(15);
  input.set_kernel_version("7.9.3");
  input.set_occt_version("7.9.3");
  input.add_supported_operations("create_box");
  input.add_supported_operations("boolean");

  auto* limits = input.mutable_server_limits();
  limits->set_max_message_size(16ULL * 1024 * 1024);
  limits->set_inline_request_limit(4ULL * 1024 * 1024);
  limits->set_inline_response_limit(4ULL * 1024 * 1024);
  limits->set_chunk_size_limit(1ULL * 1024 * 1024);
  limits->set_per_session_blob_quota(64ULL * 1024 * 1024);

  auto output = roundTrip(input);
  EXPECT_EQ(output.protocol_version(), "1.0");
  EXPECT_EQ(output.minimum_client_version(), "0.1.0");
  EXPECT_EQ(output.heartbeat_interval(), 15);
  EXPECT_EQ(output.kernel_version(), "7.9.3");
  EXPECT_EQ(output.occt_version(), "7.9.3");
  ASSERT_EQ(output.supported_operations_size(), 2);
  EXPECT_EQ(output.supported_operations(0), "create_box");
  EXPECT_EQ(output.supported_operations(1), "boolean");

  EXPECT_EQ(output.server_limits().max_message_size(), 16ULL * 1024 * 1024);
  EXPECT_EQ(output.server_limits().inline_request_limit(), 4ULL * 1024 * 1024);
  EXPECT_EQ(output.server_limits().inline_response_limit(), 4ULL * 1024 * 1024);
  EXPECT_EQ(output.server_limits().chunk_size_limit(), 1ULL * 1024 * 1024);
  EXPECT_EQ(output.server_limits().per_session_blob_quota(), 64ULL * 1024 * 1024);
}

// ---------------------------------------------------------------------------
// MeshData
// ---------------------------------------------------------------------------

TEST(CodecTest, MeshDataRoundTrip) {
  MeshData input;

  // positions: float32 LE, xyz triplets
  float pos[] = {0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f};
  input.set_positions(reinterpret_cast<const char*>(pos), sizeof(pos));

  // indices: uint32 LE, triangle indices
  uint32_t idx[] = {0, 1, 2};
  input.set_indices(reinterpret_cast<const char*>(idx), sizeof(idx));

  // face_mapping: int32 LE, per-triangle face index
  int32_t face[] = {5};
  input.set_face_mapping(reinterpret_cast<const char*>(face), sizeof(face));

  // edge_offsets: uint32 LE
  uint32_t off[] = {0, 6};
  input.set_edge_offsets(reinterpret_cast<const char*>(off), sizeof(off));

  // edge_lines: packed float32 LE
  float lines[] = {0.0f, 0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 1.0f, 1.0f};
  input.set_edge_lines(reinterpret_cast<const char*>(lines), sizeof(lines));

  auto output = roundTrip(input);

  // positions
  ASSERT_EQ(output.positions().size(), sizeof(pos));
  EXPECT_EQ(std::memcmp(output.positions().data(), pos, sizeof(pos)), 0);

  // indices
  ASSERT_EQ(output.indices().size(), sizeof(idx));
  EXPECT_EQ(std::memcmp(output.indices().data(), idx, sizeof(idx)), 0);

  // face_mapping
  ASSERT_EQ(output.face_mapping().size(), sizeof(face));
  EXPECT_EQ(std::memcmp(output.face_mapping().data(), face, sizeof(face)), 0);

  // edge_offsets
  ASSERT_EQ(output.edge_offsets().size(), sizeof(off));
  EXPECT_EQ(std::memcmp(output.edge_offsets().data(), off, sizeof(off)), 0);

  // edge_lines
  ASSERT_EQ(output.edge_lines().size(), sizeof(lines));
  EXPECT_EQ(std::memcmp(output.edge_lines().data(), lines, sizeof(lines)), 0);
}

TEST(CodecTest, MeshDataEmpty) {
  MeshData input;
  auto output = roundTrip(input);
  EXPECT_TRUE(output.positions().empty());
  EXPECT_TRUE(output.indices().empty());
  EXPECT_TRUE(output.face_mapping().empty());
  EXPECT_TRUE(output.edge_offsets().empty());
  EXPECT_TRUE(output.edge_lines().empty());
}

// ---------------------------------------------------------------------------
// Misaligned bytes (DataView copy pattern equivalent)
// ---------------------------------------------------------------------------

TEST(CodecTest, MisalignedBytesFloat32) {
  // Simulate protobuf bytes field starting at a misaligned offset (offset 1)
  // by placing float32 data at odd byte offset in a raw buffer, then copying
  // into a properly aligned string before creating Float32Array equivalent.
  alignas(4) char raw[1 + 12 + 1];  // 1 pad byte + 3 floats + 1 pad byte
  std::memset(raw, 0xAA, sizeof(raw));
  float values[] = {1.5f, -2.25f, 3.75f};
  std::memcpy(raw + 1, values, sizeof(values));

  // Copy from misaligned offset into aligned buffer (protobuf bytes field)
  std::string aligned(raw + 1, sizeof(values));
  MeshData input;
  input.set_positions(aligned);

  auto output = roundTrip(input);
  ASSERT_EQ(output.positions().size(), sizeof(values));
  float decoded[3];
  std::memcpy(decoded, output.positions().data(), sizeof(values));
  EXPECT_FLOAT_EQ(decoded[0], 1.5f);
  EXPECT_FLOAT_EQ(decoded[1], -2.25f);
  EXPECT_FLOAT_EQ(decoded[2], 3.75f);
}

TEST(CodecTest, MisalignedBytesZeroLength) {
  MeshData input;
  input.set_positions("");
  auto output = roundTrip(input);
  EXPECT_TRUE(output.positions().empty());
}

// ---------------------------------------------------------------------------
// 256 KiB payload boundary
// ---------------------------------------------------------------------------

TEST(CodecTest, PayloadBoundaryJustUnder256KiB) {
  const size_t kSize = 256 * 1024 - 1;
  std::string payload(kSize, '\xAB');
  MeshData input;
  input.set_positions(payload);

  auto output = roundTrip(input);
  ASSERT_EQ(output.positions().size(), kSize);
  EXPECT_EQ(std::memcmp(output.positions().data(), payload.data(), kSize), 0);
}

TEST(CodecTest, PayloadBoundaryJustOver256KiB) {
  const size_t kSize = 256 * 1024 + 1;
  std::string payload(kSize, '\xCD');
  MeshData input;
  input.set_positions(payload);

  auto output = roundTrip(input);
  ASSERT_EQ(output.positions().size(), kSize);
  EXPECT_EQ(std::memcmp(output.positions().data(), payload.data(), kSize), 0);
}

TEST(CodecTest, PayloadBoundaryExactly256KiB) {
  const size_t kSize = 256 * 1024;
  std::string payload(kSize, '\xEF');
  MeshData input;
  input.set_positions(payload);

  auto output = roundTrip(input);
  ASSERT_EQ(output.positions().size(), kSize);
  EXPECT_EQ(std::memcmp(output.positions().data(), payload.data(), kSize), 0);
}

// ---------------------------------------------------------------------------
// ExecuteFailure enum round-trip
// ---------------------------------------------------------------------------

TEST(CodecTest, ExecuteFailureAllCodes) {
  const std::vector<ExecutionFailureCode> codes = {
    ExecutionFailureCode::EXECUTION_FAILURE_CODE_UNSPECIFIED,
    ExecutionFailureCode::EXECUTION_FAILURE_CODE_MISSING_ENTITY,
    ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER,
    ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PROFILE,
    ExecutionFailureCode::EXECUTION_FAILURE_CODE_UNSUPPORTED,
    ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED,
    ExecutionFailureCode::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY,
    ExecutionFailureCode::EXECUTION_FAILURE_CODE_IMPORT_FAILED,
    ExecutionFailureCode::EXECUTION_FAILURE_CODE_EXPORT_FAILED,
  };

  for (auto code : codes) {
    ExecuteFailure input;
    input.set_operation("create_box");
    input.set_code(static_cast<uint32_t>(code));
    input.set_message("test error");
    input.set_details("test details");

    auto output = roundTrip(input);
    EXPECT_EQ(output.operation(), "create_box");
    EXPECT_EQ(output.code(), static_cast<uint32_t>(code));
    EXPECT_EQ(output.message(), "test error");
    EXPECT_EQ(output.details(), "test details");
  }
}

TEST(CodecTest, ExecuteFailureZeroCode) {
  ExecuteFailure input;
  input.set_operation("boolean");
  input.set_code(0);  // UNSPECIFIED
  input.set_message("");
  input.set_details("");

  auto output = roundTrip(input);
  EXPECT_EQ(output.code(), 0u);
  EXPECT_TRUE(output.message().empty());
  EXPECT_TRUE(output.details().empty());
}

// ============================================================================
// Minimal JSON parser for golden file (shared with TS via tests/golden/messages.json)
// ============================================================================

#include <fstream>
#include <filesystem>

struct Json {
  enum Type { Null, Bool, Number, String, Array, Object };
  Type type = Null;
  bool b = false;
  double n = 0;
  std::string s;
  std::vector<Json> a;
  std::map<std::string, Json> o;

  bool isObject() const { return type == Object; }
  bool isArray() const { return type == Array; }
  bool isString() const { return type == String; }
  bool isNumber() const { return type == Number; }
  bool isBool() const { return type == Bool; }
  bool has(const std::string& key) const { return o.count(key) > 0; }
  const Json& at(const std::string& key) const { return o.at(key); }
  double num(const std::string& key, double def = 0) const {
    auto it = o.find(key); return it != o.end() && it->second.isNumber() ? it->second.n : def;
  }
  int i64(const std::string& key, int def = 0) const {
    auto it = o.find(key); return it != o.end() && it->second.isNumber() ? (int)it->second.n : def;
  }
  bool fl(const std::string& key, bool def = false) const {
    auto it = o.find(key); return it != o.end() && it->second.isBool() ? it->second.b : def;
  }
  std::string str(const std::string& key, const std::string& def = "") const {
    auto it = o.find(key); return it != o.end() && it->second.isString() ? it->second.s : def;
  }
};

class JsonParser {
  const std::string& s_;
  size_t i_ = 0;
  void skipWs() { while (i_ < s_.size() && std::isspace((unsigned char)s_[i_])) ++i_; }
  std::string parseString() {
    ++i_; // consume opening quote
    std::string out;
    while (i_ < s_.size()) {
      char c = s_[i_++];
      if (c == '"') break;
      if (c == '\\' && i_ < s_.size()) {
        char e = s_[i_++];
        switch (e) {
          case '"': out.push_back('"'); break;
          case '\\': out.push_back('\\'); break;
          case '/': out.push_back('/'); break;
          case 'b': out.push_back('\b'); break;
          case 'f': out.push_back('\f'); break;
          case 'n': out.push_back('\n'); break;
          case 'r': out.push_back('\r'); break;
          case 't': out.push_back('\t'); break;
          case 'u': i_ += 4; out.push_back('?'); break;
          default: out.push_back(e); break;
        }
      } else {
        out.push_back(c);
      }
    }
    return out;
  }
  double parseNumber() {
    size_t start = i_;
    while (i_ < s_.size() && (std::isdigit((unsigned char)s_[i_]) || s_[i_] == '.' ||
                              s_[i_] == '-' || s_[i_] == '+' || s_[i_] == 'e' || s_[i_] == 'E')) ++i_;
    return std::stod(s_.substr(start, i_ - start));
  }
  Json parseValue() {
    skipWs();
    if (i_ >= s_.size()) return Json{};
    char c = s_[i_];
    if (c == '{') {
      ++i_; Json j; j.type = Json::Object;
      if (s_[i_] == '}') { ++i_; return j; }
      while (true) {
        skipWs();
        std::string key = parseString();
        skipWs();
        if (s_[i_] == ':') ++i_;
        j.o[key] = parseValue();
        skipWs();
        if (s_[i_] == ',') { ++i_; continue; }
        if (s_[i_] == '}') { ++i_; break; }
      }
      return j;
    }
    if (c == '[') {
      ++i_; Json j; j.type = Json::Array;
      if (s_[i_] == ']') { ++i_; return j; }
      while (true) {
        j.a.push_back(parseValue());
        skipWs();
        if (s_[i_] == ',') { ++i_; continue; }
        if (s_[i_] == ']') { ++i_; break; }
      }
      return j;
    }
    if (c == '"') { Json j; j.type = Json::String; j.s = parseString(); return j; }
    if (s_.compare(i_, 4, "true") == 0) { i_ += 4; Json j; j.type = Json::Bool; j.b = true; return j; }
    if (s_.compare(i_, 5, "false") == 0) { i_ += 5; Json j; j.type = Json::Bool; j.b = false; return j; }
    if (s_.compare(i_, 4, "null") == 0) { i_ += 4; return Json{}; }
    Json j; j.type = Json::Number; j.n = parseNumber(); return j;
  }
public:
  explicit JsonParser(const std::string& str) : s_(str) {}
  Json parse() { skipWs(); return parseValue(); }
};

// Base64 decode
static std::string base64Decode(const std::string& in) {
  static const char* b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  int T[256];
  for (int i = 0; i < 256; i++) T[i] = -1;
  for (int i = 0; i < 64; i++) T[(unsigned char)b64[i]] = i;
  std::string out;
  int val = 0, valb = -8;
  for (unsigned char c : in) {
    if (T[c] == -1) continue;
    val = (val << 6) + T[c];
    valb += 6;
    if (valb >= 0) { out.push_back(char((val >> valb) & 0xFF)); valb -= 8; }
  }
  return out;
}

// Locate the golden file relative to this source file.
static std::string goldenFilePath() {
  std::filesystem::path p(__FILE__);
  p = p.parent_path().parent_path(); // tests/codec_test.cpp -> project root
  p /= "tests/golden/messages.json";
  return p.string();
}

// ---------------------------------------------------------------------------
// Helpers to extract typed values from a Json object
// ---------------------------------------------------------------------------

static void setPoint3D(const Json& parent, const std::string& key, webcad::engine::v1::Point3D* p) {
  if (!parent.o.count(key)) return;
  const Json& pt = parent.o.at(key);
  if (pt.isObject()) {
    p->set_x(pt.num("x", 0.0));
    p->set_y(pt.num("y", 0.0));
    p->set_z(pt.num("z", 0.0));
  }
}

static void setPoint3DArray(const Json& arr, webcad::engine::v1::CreateExtrudeOp* op) {
  for (const auto& pt : arr.a) {
    webcad::engine::v1::Point3D* p = op->add_points();
    p->set_x(pt.num("x", 0.0));
    p->set_y(pt.num("y", 0.0));
    p->set_z(pt.num("z", 0.0));
  }
}

static void setStringArray(const Json& arr, ::google::protobuf::RepeatedPtrField<std::string>* field) {
  for (const auto& s : arr.a) field->Add()->assign(s.s);
}

static void setDoubleArray(const Json& arr, ::google::protobuf::RepeatedField<double>* field) {
  for (const auto& v : arr.a) field->Add(v.n);
}

// ---------------------------------------------------------------------------
// Per-message-type golden round-trip
// ---------------------------------------------------------------------------

static void testCommandHeader(const Json& input) {
  webcad::engine::v1::CommandHeader msg;
  msg.set_session_id(input.str("sessionId"));
  msg.set_request_id(input.str("requestId"));
  msg.set_client_seq((uint64_t)input.i64("clientSeq", 0));
  msg.set_document_id(input.str("documentId"));
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.session_id(), msg.session_id());
  EXPECT_EQ(decoded.request_id(), msg.request_id());
  EXPECT_EQ(decoded.client_seq(), msg.client_seq());
  EXPECT_EQ(decoded.document_id(), msg.document_id());
}

static void testMeshData(const Json& input) {
  webcad::engine::v1::MeshData msg;
  if (input.has("positions")) msg.set_positions(base64Decode(input.str("positions")));
  if (input.has("indices")) msg.set_indices(base64Decode(input.str("indices")));
  if (input.has("faceMapping")) msg.set_face_mapping(base64Decode(input.str("faceMapping")));
  if (input.has("edgeOffsets")) msg.set_edge_offsets(base64Decode(input.str("edgeOffsets")));
  if (input.has("edgeLines")) msg.set_edge_lines(base64Decode(input.str("edgeLines")));
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.positions(), msg.positions());
  EXPECT_EQ(decoded.indices(), msg.indices());
  EXPECT_EQ(decoded.face_mapping(), msg.face_mapping());
  EXPECT_EQ(decoded.edge_offsets(), msg.edge_offsets());
  EXPECT_EQ(decoded.edge_lines(), msg.edge_lines());
}

static void testExecuteFailure(const Json& input) {
  webcad::engine::v1::ExecuteFailure msg;
  msg.set_operation(input.str("operation"));
  msg.set_code((uint32_t)input.i64("code", 0));
  msg.set_message(input.str("message"));
  msg.set_details(input.str("details"));
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.operation(), msg.operation());
  EXPECT_EQ(decoded.code(), msg.code());
  EXPECT_EQ(decoded.message(), msg.message());
  EXPECT_EQ(decoded.details(), msg.details());
}

static void testOpenSessionRequest(const Json& input) {
  webcad::engine::v1::OpenSessionRequest msg;
  if (input.has("header")) {
    auto* h = msg.mutable_header();
    h->set_session_id(input.at("header").str("sessionId"));
    h->set_request_id(input.at("header").str("requestId"));
    h->set_client_seq((uint64_t)input.at("header").i64("clientSeq", 0));
    h->set_document_id(input.at("header").str("documentId"));
  }
  msg.set_client_version(input.str("clientVersion"));
  msg.set_include_brep(input.fl("includeBrep"));
  auto decoded = roundTrip(msg);
  if (msg.has_header()) {
    EXPECT_EQ(decoded.header().session_id(), msg.header().session_id());
    EXPECT_EQ(decoded.header().client_seq(), msg.header().client_seq());
  }
  EXPECT_EQ(decoded.client_version(), msg.client_version());
  EXPECT_EQ(decoded.include_brep(), msg.include_brep());
}

static void testOpenSessionResponse(const Json& input) {
  webcad::engine::v1::OpenSessionResponse msg;
  msg.set_protocol_version(input.str("protocolVersion"));
  msg.set_minimum_client_version(input.str("minimumClientVersion"));
  msg.set_heartbeat_interval((uint32_t)input.i64("heartbeatInterval", 0));
  msg.set_kernel_version(input.str("kernelVersion"));
  msg.set_occt_version(input.str("occtVersion"));
  if (input.has("serverLimits")) {
    auto* l = msg.mutable_server_limits();
    const Json& sl = input.at("serverLimits");
    l->set_max_message_size((uint64_t)sl.i64("maxMessageSize", 0));
    l->set_inline_request_limit((uint64_t)sl.i64("inlineRequestLimit", 0));
    l->set_inline_response_limit((uint64_t)sl.i64("inlineResponseLimit", 0));
    l->set_chunk_size_limit((uint64_t)sl.i64("chunkSizeLimit", 0));
    l->set_per_session_blob_quota((uint64_t)sl.i64("perSessionBlobQuota", 0));
  }
  if (input.has("supportedOperations"))
    setStringArray(input.at("supportedOperations"), msg.mutable_supported_operations());
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.protocol_version(), msg.protocol_version());
  EXPECT_EQ(decoded.minimum_client_version(), msg.minimum_client_version());
  EXPECT_EQ(decoded.heartbeat_interval(), msg.heartbeat_interval());
  EXPECT_EQ(decoded.kernel_version(), msg.kernel_version());
  EXPECT_EQ(decoded.occt_version(), msg.occt_version());
  EXPECT_EQ(decoded.supported_operations_size(), msg.supported_operations_size());
  if (msg.has_server_limits()) {
    EXPECT_EQ(decoded.server_limits().max_message_size(), msg.server_limits().max_message_size());
    EXPECT_EQ(decoded.server_limits().per_session_blob_quota(), msg.server_limits().per_session_blob_quota());
  }
}

static void testHealthRequest(const Json& input) {
  webcad::engine::v1::HealthRequest msg;
  msg.set_service(input.str("service"));
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.service(), msg.service());
}

static void testHealthResponse(const Json& input) {
  webcad::engine::v1::HealthResponse msg;
  msg.set_status((webcad::engine::v1::HealthResponse_ServingStatus)input.i64("status", 0));
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.status(), msg.status());
}

static void testInitOp(const Json&) {
  webcad::engine::v1::InitOp msg;
  auto decoded = roundTrip(msg);
  (void)decoded;
}

static void testClearCacheOp(const Json&) {
  webcad::engine::v1::ClearCacheOp msg;
  auto decoded = roundTrip(msg);
  (void)decoded;
}

static void testReleaseShapesOp(const Json& input) {
  webcad::engine::v1::ReleaseShapesOp msg;
  if (input.has("entityIds"))
    setStringArray(input.at("entityIds"), msg.mutable_entity_ids());
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.entity_ids_size(), msg.entity_ids_size());
}

static void testCheckValidityOp(const Json& input) {
  webcad::engine::v1::CheckValidityOp msg;
  msg.set_entity_id(input.str("entityId"));
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
}

static void testExportBRepOp(const Json& input) {
  webcad::engine::v1::ExportBRepOp msg;
  msg.set_entity_id(input.str("entityId"));
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
}

static void testCreateBoxOp(const Json& input) {
  webcad::engine::v1::CreateBoxOp msg;
  msg.set_x(input.num("x", 0.0));
  msg.set_y(input.num("y", 0.0));
  msg.set_z(input.num("z", 0.0));
  msg.set_dx(input.num("dx", 0.0));
  msg.set_dy(input.num("dy", 0.0));
  msg.set_dz(input.num("dz", 0.0));
  msg.set_deflection(input.num("deflection", 0.0));
  msg.set_entity_id(input.str("entityId"));
  auto decoded = roundTrip(msg);
  EXPECT_DOUBLE_EQ(decoded.x(), msg.x());
  EXPECT_DOUBLE_EQ(decoded.dx(), msg.dx());
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
}

static void testCreateCylinderOp(const Json& input) {
  webcad::engine::v1::CreateCylinderOp msg;
  msg.set_x(input.num("x", 0.0));
  msg.set_y(input.num("y", 0.0));
  msg.set_z(input.num("z", 0.0));
  msg.set_r(input.num("r", 0.0));
  msg.set_h(input.num("h", 0.0));
  msg.set_deflection(input.num("deflection", 0.0));
  msg.set_entity_id(input.str("entityId"));
  auto decoded = roundTrip(msg);
  EXPECT_DOUBLE_EQ(decoded.r(), msg.r());
  EXPECT_DOUBLE_EQ(decoded.h(), msg.h());
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
}

static void testCreateSphereOp(const Json& input) {
  webcad::engine::v1::CreateSphereOp msg;
  msg.set_x(input.num("x", 0.0));
  msg.set_y(input.num("y", 0.0));
  msg.set_z(input.num("z", 0.0));
  msg.set_r(input.num("r", 0.0));
  msg.set_deflection(input.num("deflection", 0.0));
  msg.set_entity_id(input.str("entityId"));
  auto decoded = roundTrip(msg);
  EXPECT_DOUBLE_EQ(decoded.r(), msg.r());
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
}

static void testCreateConeOp(const Json& input) {
  webcad::engine::v1::CreateConeOp msg;
  msg.set_x(input.num("x", 0.0));
  msg.set_y(input.num("y", 0.0));
  msg.set_z(input.num("z", 0.0));
  msg.set_r(input.num("r", 0.0));
  msg.set_h(input.num("h", 0.0));
  msg.set_deflection(input.num("deflection", 0.0));
  msg.set_entity_id(input.str("entityId"));
  auto decoded = roundTrip(msg);
  EXPECT_DOUBLE_EQ(decoded.r(), msg.r());
  EXPECT_DOUBLE_EQ(decoded.h(), msg.h());
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
}

static void testCreateBooleanOp(const Json& input) {
  webcad::engine::v1::CreateBooleanOp msg;
  msg.set_operation(input.str("operation"));
  msg.set_id_a(input.str("idA"));
  msg.set_id_b(input.str("idB"));
  msg.set_entity_id(input.str("entityId"));
  msg.set_deflection(input.num("deflection", 0.0));
  setPoint3D(input, "rotA", msg.mutable_rot_a());
  setPoint3D(input, "rotB", msg.mutable_rot_b());
  setPoint3D(input, "centerA", msg.mutable_center_a());
  setPoint3D(input, "centerB", msg.mutable_center_b());
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.operation(), msg.operation());
  EXPECT_EQ(decoded.id_a(), msg.id_a());
  EXPECT_EQ(decoded.id_b(), msg.id_b());
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
  EXPECT_DOUBLE_EQ(decoded.deflection(), msg.deflection());
  EXPECT_DOUBLE_EQ(decoded.rot_a().x(), msg.rot_a().x());
  EXPECT_DOUBLE_EQ(decoded.center_b().z(), msg.center_b().z());
}

static void testCreateExtrudeOp(const Json& input) {
  webcad::engine::v1::CreateExtrudeOp msg;
  if (input.has("points")) setPoint3DArray(input.at("points"), &msg);
  msg.set_height(input.num("height", 0.0));
  msg.set_thickness(input.num("thickness", 0.0));
  msg.set_deflection(input.num("deflection", 0.0));
  msg.set_is_closed(input.fl("isClosed"));
  msg.set_entity_id(input.str("entityId"));
  if (input.has("vector")) setDoubleArray(input.at("vector"), msg.mutable_vector());
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.points_size(), msg.points_size());
  EXPECT_DOUBLE_EQ(decoded.height(), msg.height());
  EXPECT_EQ(decoded.is_closed(), msg.is_closed());
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
  EXPECT_EQ(decoded.vector_size(), msg.vector_size());
}

static void testCreateRevolveOp(const Json& input) {
  webcad::engine::v1::CreateRevolveOp msg;
  if (input.has("points")) {
    for (const auto& pt : input.at("points").a) {
      webcad::engine::v1::Point3D* p = msg.add_points();
      p->set_x(pt.num("x", 0.0));
      p->set_y(pt.num("y", 0.0));
      p->set_z(pt.num("z", 0.0));
    }
  }
  setPoint3D(input, "axisPoint", msg.mutable_axis_point());
  setPoint3D(input, "axisDir", msg.mutable_axis_dir());
  msg.set_angle(input.num("angle", 0.0));
  msg.set_thickness(input.num("thickness", 0.0));
  msg.set_deflection(input.num("deflection", 0.0));
  msg.set_is_closed(input.fl("isClosed"));
  msg.set_entity_id(input.str("entityId"));
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.points_size(), msg.points_size());
  EXPECT_DOUBLE_EQ(decoded.angle(), msg.angle());
  EXPECT_DOUBLE_EQ(decoded.axis_point().x(), msg.axis_point().x());
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
}

static void testMultMatrixShapeOp(const Json& input) {
  webcad::engine::v1::MultMatrixShapeOp msg;
  msg.set_entity_id(input.str("entityId"));
  if (input.has("m")) setDoubleArray(input.at("m"), msg.mutable_m());
  msg.set_target_entity_id(input.str("targetEntityId"));
  msg.set_deflection(input.num("deflection", 0.0));
  auto decoded = roundTrip(msg);
  EXPECT_EQ(decoded.entity_id(), msg.entity_id());
  EXPECT_EQ(decoded.m_size(), msg.m_size());
  EXPECT_EQ(decoded.target_entity_id(), msg.target_entity_id());
}

static void testTransformShapeOp(const Json& input) {
  webcad::engine::v1::TransformShapeOp msg;
  msg.set_entity_id(input.str("entityId"));
  msg.set_dx(input.num("dx", 0.0));
  msg.set_dy(input.num("dy", 0.0));
  msg.set_dz(input.num("dz", 0.0));
  msg.set_target_entity_id(input.str("targetEntityId"));
  msg.set_deflection(input.num("deflection", 0.0));
  auto decoded = roundTrip(msg);
  EXPECT_DOUBLE_EQ(decoded.dx(), msg.dx());
  EXPECT_DOUBLE_EQ(decoded.dy(), msg.dy());
  EXPECT_DOUBLE_EQ(decoded.dz(), msg.dz());
  EXPECT_EQ(decoded.target_entity_id(), msg.target_entity_id());
}

// ---------------------------------------------------------------------------
// Golden file driver: read shared JSON, run every case
// ---------------------------------------------------------------------------

TEST(CodecTest, GoldenRoundTrip) {
  std::ifstream f(goldenFilePath(), std::ios::binary);
  ASSERT_TRUE(f.is_open()) << "cannot open " << goldenFilePath();
  std::string content((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());

  JsonParser parser(content);
  Json root = parser.parse();
  ASSERT_TRUE(root.isArray()) << "golden root must be a JSON array";

  int ran = 0;
  for (const auto& c : root.a) {
    std::string type = c.str("message_type");
    std::string desc = c.str("description");
    const Json& input = c.at("input");

    if (type == "CommandHeader") testCommandHeader(input);
    else if (type == "MeshData") testMeshData(input);
    else if (type == "ExecuteFailure") testExecuteFailure(input);
    else if (type == "OpenSessionRequest") testOpenSessionRequest(input);
    else if (type == "OpenSessionResponse") testOpenSessionResponse(input);
    else if (type == "HealthRequest") testHealthRequest(input);
    else if (type == "HealthResponse") testHealthResponse(input);
    else if (type == "InitOp") testInitOp(input);
    else if (type == "ClearCacheOp") testClearCacheOp(input);
    else if (type == "ReleaseShapesOp") testReleaseShapesOp(input);
    else if (type == "CheckValidityOp") testCheckValidityOp(input);
    else if (type == "ExportBRepOp") testExportBRepOp(input);
    else if (type == "CreateBoxOp") testCreateBoxOp(input);
    else if (type == "CreateCylinderOp") testCreateCylinderOp(input);
    else if (type == "CreateSphereOp") testCreateSphereOp(input);
    else if (type == "CreateConeOp") testCreateConeOp(input);
    else if (type == "CreateBooleanOp") testCreateBooleanOp(input);
    else if (type == "CreateExtrudeOp") testCreateExtrudeOp(input);
    else if (type == "CreateRevolveOp") testCreateRevolveOp(input);
    else if (type == "MultMatrixShapeOp") testMultMatrixShapeOp(input);
    else if (type == "TransformShapeOp") testTransformShapeOp(input);
    else FAIL() << "unknown message_type: " << type;
    ++ran;
  }
  EXPECT_GT(ran, 0) << "no golden cases executed";
}

// ---------------------------------------------------------------------------

int main(int argc, char** argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
