cmake_minimum_required(VERSION 3.16)
project(kernel LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# =====================================================================
# Fast linker: prefer mold, fall back to lld, then system default
# =====================================================================
find_program(MOLD_LINKER mold)
if(MOLD_LINKER)
  set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fuse-ld=mold")
  set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -fuse-ld=mold")
  message(STATUS "Using mold linker: ${MOLD_LINKER}")
else()
  find_program(LLD_LINKER ld.lld)
  if(LLD_LINKER)
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fuse-ld=lld")
    set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -fuse-ld=lld")
    message(STATUS "Using lld linker: ${LLD_LINKER}")
  else()
    message(STATUS "No fast linker found — using system default linker")
  endif()
endif()


# OCCT installed to /usr/local by make install (Dockerfile.kernel stage 2).
# find_package(OpenCASCADE) without COMPONENTS does not create per-module targets,
# so find each shared library manually.
set(OCCT_LIB_DIR /usr/local/lib)

find_library(TKERNEL_LIB NAMES TKernel PATHS ${OCCT_LIB_DIR})
find_library(TKMATH_LIB NAMES TKMath PATHS ${OCCT_LIB_DIR})
find_library(TKBREP_LIB NAMES TKBRep PATHS ${OCCT_LIB_DIR})
find_library(TKGEOMBASE_LIB NAMES TKGeomBase PATHS ${OCCT_LIB_DIR})
find_library(TKGEOMALGO_LIB NAMES TKGeomAlgo PATHS ${OCCT_LIB_DIR})
find_library(TKTOPALGO_LIB NAMES TKTopAlgo PATHS ${OCCT_LIB_DIR})
find_library(TKPRIM_LIB NAMES TKPrim PATHS ${OCCT_LIB_DIR})
find_library(TKBOOL_LIB NAMES TKBool PATHS ${OCCT_LIB_DIR})
find_library(TKBO_LIB NAMES TKBO PATHS ${OCCT_LIB_DIR})
find_library(TKFILLET_LIB NAMES TKFillet PATHS ${OCCT_LIB_DIR})
find_library(TKOFFSET_LIB NAMES TKOffset PATHS ${OCCT_LIB_DIR})
find_library(TKSHEALING_LIB NAMES TKShHealing PATHS ${OCCT_LIB_DIR})
find_library(TKMESH_LIB NAMES TKMesh PATHS ${OCCT_LIB_DIR})
find_library(TKBIN_LIB NAMES TKBin PATHS ${OCCT_LIB_DIR})
find_library(TKDESTEP_LIB NAMES TKDESTEP TKSTEP PATHS ${OCCT_LIB_DIR})
find_library(TKDEIGES_LIB NAMES TKDEIGES TKIGES PATHS ${OCCT_LIB_DIR})
find_library(TKXSBASE_LIB NAMES TKXSBase TKXSBase PATHS ${OCCT_LIB_DIR})

foreach(lib TKERNEL_LIB TKMATH_LIB TKBREP_LIB TKGEOMBASE_LIB TKGEOMALGO_LIB TKTOPALGO_LIB TKPRIM_LIB TKBOOL_LIB TKBO_LIB TKFILLET_LIB TKOFFSET_LIB TKSHEALING_LIB TKMESH_LIB TKBIN_LIB TKDESTEP_LIB TKDEIGES_LIB TKXSBASE_LIB)
  if(NOT ${lib})
    message(FATAL_ERROR "OpenCASCADE library ${lib} not found in ${OCCT_LIB_DIR}")
  endif()
  message(STATUS "Found OCCT library: ${lib} = ${${lib}}")
endforeach()

find_path(OCCT_INCLUDE_DIR NAMES TopoDS_Shape.hxx PATHS /usr/local/include /usr/local/include/opencascade)
if(NOT OCCT_INCLUDE_DIR)
  message(FATAL_ERROR "OpenCASCADE headers not found in /usr/local/include")
endif()
message(STATUS "Found OCCT headers: ${OCCT_INCLUDE_DIR}")

# Protobuf: try config package, fall back to find_library (Ubuntu 22.04 libprotobuf-dev
# may not install ProtobufConfig.cmake, so Protobuf::libprotobuf target may not exist)
find_package(Protobuf QUIET)
if(Protobuf_FOUND AND TARGET Protobuf::libprotobuf)
  set(PROTO_LIB Protobuf::libprotobuf)
  message(STATUS "Found Protobuf via config package: ${PROTO_LIB}")
else()
  find_library(PROTO_LIB NAMES protobuf libprotobuf PATHS /usr/lib/x86_64-linux-gnu /usr/lib)
  find_path(PROTO_INCLUDE_DIR NAMES google/protobuf/stubs/common.h PATHS /usr/include)
  if(NOT PROTO_LIB)
    message(FATAL_ERROR "protobuf library not found")
  endif()
  message(STATUS "Found Protobuf via find_library: ${PROTO_LIB}")
endif()

# gRPC: no CMake config package on Ubuntu 22.04 libgrpc-dev; find libraries manually
find_program(PROTOC_EXECUTABLE protoc)
find_program(GRPC_CPP_PLUGIN grpc_cpp_plugin)
find_library(GRPCPP_LIBRARY NAMES grpc++ PATHS /usr/lib/x86_64-linux-gnu)
find_library(GRPC_LIBRARY NAMES grpc PATHS /usr/lib/x86_64-linux-gnu)
find_path(GRPCPP_INCLUDE_DIR NAMES grpcpp/client_context.h PATHS /usr/include)
find_path(GRPC_INCLUDE_DIR NAMES grpc/support/log.h PATHS /usr/include)

if(NOT PROTOC_EXECUTABLE)
  message(FATAL_ERROR "protoc not found")
endif()
message(STATUS "Found protoc: ${PROTOC_EXECUTABLE}")
if(NOT GRPC_CPP_PLUGIN)
  message(FATAL_ERROR "grpc_cpp_plugin not found")
endif()
message(STATUS "Found grpc_cpp_plugin: ${GRPC_CPP_PLUGIN}")
if(NOT GRPCPP_LIBRARY OR NOT GRPC_LIBRARY)
  message(FATAL_ERROR "gRPC libraries not found")
endif()
message(STATUS "Found gRPC++: ${GRPCPP_LIBRARY}")
message(STATUS "Found gRPC: ${GRPC_LIBRARY}")
if(NOT GRPCPP_INCLUDE_DIR)
  message(FATAL_ERROR "gRPC++ headers not found")
endif()
message(STATUS "Found gRPC++ headers: ${GRPCPP_INCLUDE_DIR}")
if(NOT GRPC_INCLUDE_DIR)
  message(FATAL_ERROR "gRPC headers not found")
endif()
message(STATUS "Found gRPC headers: ${GRPC_INCLUDE_DIR}")

# Proto directory — proto_path must be proto/ root because engine.proto imports
# "webcad/engine/v1/common.proto". Generated output lands in
# build/webcad/engine/v1/ preserving the subdirectory structure.
set(PROTO_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/proto)
set(GEN_DIR ${CMAKE_CURRENT_BINARY_DIR}/webcad/engine/v1)

# Generate C++ stubs from protobuf definitions
foreach(PROTO_FILE engine.proto common.proto)
  get_filename_component(PROTO_NAME ${PROTO_FILE} NAME_WE)
  
  # Protobuf C++ generation
  add_custom_command(
    OUTPUT
      ${GEN_DIR}/${PROTO_NAME}.pb.cc
      ${GEN_DIR}/${PROTO_NAME}.pb.h
    COMMAND ${PROTOC_EXECUTABLE}
      --proto_path=${PROTO_ROOT}
      --cpp_out=${CMAKE_CURRENT_BINARY_DIR}
      ${PROTO_ROOT}/webcad/engine/v1/${PROTO_FILE}
    DEPENDS ${PROTO_ROOT}/webcad/engine/v1/${PROTO_FILE}
    VERBATIM
  )
  
  # gRPC C++ generation
  add_custom_command(
    OUTPUT
      ${GEN_DIR}/${PROTO_NAME}.grpc.pb.cc
      ${GEN_DIR}/${PROTO_NAME}.grpc.pb.h
    COMMAND ${PROTOC_EXECUTABLE}
      --proto_path=${PROTO_ROOT}
      --grpc_out=${CMAKE_CURRENT_BINARY_DIR}
      --plugin=protoc-gen-grpc=${GRPC_CPP_PLUGIN}
      ${PROTO_ROOT}/webcad/engine/v1/${PROTO_FILE}
    DEPENDS ${PROTO_ROOT}/webcad/engine/v1/${PROTO_FILE} ${GRPC_CPP_PLUGIN}
    VERBATIM
  )
  
  list(APPEND PROTO_SRCS
    ${GEN_DIR}/${PROTO_NAME}.pb.cc
    ${GEN_DIR}/${PROTO_NAME}.grpc.pb.cc
  )
  list(APPEND PROTO_HDRS
    ${GEN_DIR}/${PROTO_NAME}.pb.h
    ${GEN_DIR}/${PROTO_NAME}.grpc.pb.h
  )
endforeach()

add_executable(kernel_worker
  src/core/gateway/kernel-worker.cpp
  ${PROTO_SRCS}
  ${PROTO_HDRS}
)


target_include_directories(kernel_worker PRIVATE
  ${CMAKE_CURRENT_BINARY_DIR}
  /usr/local/include
  ${OCCT_INCLUDE_DIR}
  ${GRPCPP_INCLUDE_DIR}
  ${GRPC_INCLUDE_DIR}
)

if(DEFINED PROTO_INCLUDE_DIR)
  target_include_directories(kernel_worker PRIVATE ${PROTO_INCLUDE_DIR})
endif()

target_link_libraries(kernel_worker PRIVATE
  ${TKERNEL_LIB} ${TKMATH_LIB} ${TKBREP_LIB}
  ${TKGEOMBASE_LIB} ${TKGEOMALGO_LIB} ${TKTOPALGO_LIB}
  ${TKPRIM_LIB} ${TKBOOL_LIB} ${TKBO_LIB}
  ${TKFILLET_LIB} ${TKOFFSET_LIB} ${TKSHEALING_LIB}
  ${TKMESH_LIB} ${TKBIN_LIB} ${TKDESTEP_LIB} ${TKDEIGES_LIB} ${TKXSBASE_LIB}
  ${PROTO_LIB}
  ${GRPCPP_LIBRARY} ${GRPC_LIBRARY}
)

# Platform-specific flags
if(MSVC)
  target_compile_options(kernel_worker PRIVATE /EHa /utf-8 /bigobj)
else()
  target_compile_options(kernel_worker PRIVATE -Wswitch)
  target_compile_definitions(kernel_worker PRIVATE OCC_CONVERT_SIGNALS)
endif()

# =====================================================================
# gtest discovery (Ubuntu libgtest-dev ships sources at /usr/src/gtest;
# pre-built static libs may be at /usr/lib/x86_64-linux-gnu)
# =====================================================================
find_library(GTEST_LIB NAMES gtest libgtest PATHS
  /usr/lib/x86_64-linux-gnu /usr/lib /usr/local/lib)
find_library(GTEST_MAIN_LIB NAMES gtest_main libgtest_main PATHS
  /usr/lib/x86_64-linux-gnu /usr/lib /usr/local/lib)
find_path(GTEST_INCLUDE_DIR NAMES gtest/gtest.h PATHS
  /usr/include /usr/local/include /usr/src/googletest/googletest/include)

if(NOT GTEST_LIB OR NOT GTEST_INCLUDE_DIR)
  message(FATAL_ERROR "Google Test not found. Install libgtest-dev (apt-get install libgtest-dev).")
endif()
message(STATUS "Found gtest: ${GTEST_LIB}")
message(STATUS "Found gtest_main: ${GTEST_MAIN_LIB}")
message(STATUS "Found gtest headers: ${GTEST_INCLUDE_DIR}")

# =====================================================================
# codec_test target — C++ codec round-trip tests mirroring TS suite
# =====================================================================
add_executable(codec_test
  tests/codec_test.cpp
  ${PROTO_SRCS}
  ${PROTO_HDRS}
)

target_include_directories(codec_test PRIVATE
  ${CMAKE_CURRENT_BINARY_DIR}
  ${GTEST_INCLUDE_DIR}
)

target_link_libraries(codec_test PRIVATE
  ${GTEST_LIB}
  ${GTEST_MAIN_LIB}
  ${PROTO_LIB}
  ${GRPCPP_LIBRARY} ${GRPC_LIBRARY}
)

# Enable testing so `ctest` can discover codec_test
include(CTest)
add_test(NAME codec_test COMMAND codec_test WORKING_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR})