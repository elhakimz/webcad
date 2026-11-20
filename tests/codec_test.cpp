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

// ---------------------------------------------------------------------------

int main(int argc, char** argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
