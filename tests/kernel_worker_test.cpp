// Kernel worker unit tests: tests OpReleaseShapes and ReleaseShapesOp codec.
// Build: added as `kernel_worker_test` target in CMakeLists.txt
// Run:   ./build/kernel_worker_test  or  ctest --test-dir build -R kernel_worker_test

#define SKIP_MAIN  // exclude main() from kernel-worker.cpp
#include "../src/core/gateway/kernel-worker.cpp"

#include <gtest/gtest.h>

#include <string>
#include <vector>

using webcad::engine::v1::ReleaseShapesOp;

// ---------------------------------------------------------------------------
// ReleaseShapesOp protobuf round-trip
// ---------------------------------------------------------------------------

TEST(KernelWorkerTest, ReleaseShapesOpRoundTripMultipleIds) {
  ReleaseShapesOp input;
  input.add_entity_ids("shape_1");
  input.add_entity_ids("shape_2");
  input.add_entity_ids("shape_3");

  std::string binary;
  input.SerializeToString(&binary);

  ReleaseShapesOp decoded;
  decoded.ParseFromString(binary);

  ASSERT_EQ(decoded.entity_ids_size(), 3);
  EXPECT_EQ(decoded.entity_ids(0), "shape_1");
  EXPECT_EQ(decoded.entity_ids(1), "shape_2");
  EXPECT_EQ(decoded.entity_ids(2), "shape_3");
}

TEST(KernelWorkerTest, ReleaseShapesOpRoundTripEmpty) {
  ReleaseShapesOp input;
  std::string binary;
  input.SerializeToString(&binary);

  ReleaseShapesOp decoded;
  decoded.ParseFromString(binary);

  EXPECT_EQ(decoded.entity_ids_size(), 0);
}

TEST(KernelWorkerTest, ReleaseShapesOpRoundTripSingleId) {
  ReleaseShapesOp input;
  input.add_entity_ids("shape_42");

  std::string binary;
  input.SerializeToString(&binary);

  ReleaseShapesOp decoded;
  decoded.ParseFromString(binary);

  ASSERT_EQ(decoded.entity_ids_size(), 1);
  EXPECT_EQ(decoded.entity_ids(0), "shape_42");
}

// ---------------------------------------------------------------------------
// OpReleaseShapes logic
// ---------------------------------------------------------------------------

TEST(KernelWorkerTest, OpReleaseShapesReleasesExistingShapes) {
  // Pre-populate the shape cache with dummy entries.
  // TopoDS_Shape is handle-like; default-constructed shapes are null but
  // still valid map values for presence/absence testing.
  g_shapeCache["shape_a"] = TopoDS_Shape();
  g_shapeCache["shape_b"] = TopoDS_Shape();
  g_shapeCache["shape_c"] = TopoDS_Shape();

  auto r = OpReleaseShapes({"shape_a", "shape_b"});

  EXPECT_TRUE(r.ok);
  EXPECT_EQ(g_shapeCache.count("shape_a"), 0);
  EXPECT_EQ(g_shapeCache.count("shape_b"), 0);
  EXPECT_EQ(g_shapeCache.count("shape_c"), 1);
  EXPECT_NE(r.message.find("Released 2 shape(s)"), std::string::npos);
}

TEST(KernelWorkerTest, OpReleaseShapesMissingEntity) {
  g_shapeCache.clear();
  g_shapeCache["shape_a"] = TopoDS_Shape();

  auto r = OpReleaseShapes({"shape_a", "shape_missing"});

  EXPECT_TRUE(r.ok);  // partial success is still ok
  EXPECT_EQ(g_shapeCache.count("shape_a"), 0);
  EXPECT_NE(r.message.find("not found"), std::string::npos);
}

TEST(KernelWorkerTest, OpReleaseShapesEmptyList) {
  g_shapeCache.clear();
  g_shapeCache["shape_a"] = TopoDS_Shape();

  auto r = OpReleaseShapes({});

  EXPECT_TRUE(r.ok);
  EXPECT_EQ(g_shapeCache.count("shape_a"), 1);
  EXPECT_NE(r.message.find("Released 0 shape(s)"), std::string::npos);
}

TEST(KernelWorkerTest, OpReleaseShapesAllMissing) {
  g_shapeCache.clear();

  auto r = OpReleaseShapes({"shape_x", "shape_y"});

  EXPECT_TRUE(r.ok);
  EXPECT_NE(r.message.find("not found"), std::string::npos);
}

// ---------------------------------------------------------------------------

int main(int argc, char** argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
