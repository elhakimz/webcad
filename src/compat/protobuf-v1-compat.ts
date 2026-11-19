// Compatibility shim: provides @bufbuild/protobuf v1.x API surface
// (Message base class, proto3.util.*) on top of v2.x.
// Generated protobuf code (protoc-gen-es v1.x) imports { Message, proto3, protoInt64 }
// from "@bufbuild/protobuf", but v2.x only exports protoInt64.
//
// This shim re-exports all v2.x exports and adds the v1.x compat layer so
// generated code keeps working without regeneration.
//
// NOTE: v2.x is imported via a relative path to node_modules to avoid the
// Vite alias (@bufbuild/protobuf -> this shim) causing a circular import.

import * as v2 from "../../node_modules/@bufbuild/protobuf";

// --- Re-export everything from v2.x ---
export * from "../../node_modules/@bufbuild/protobuf";

// --- v1.x protoInt64 (v2.x exports it natively) ---
export { protoInt64 } from "../../node_modules/@bufbuild/protobuf";

// --- v1.x MethodKind (v2.x exports it natively) ---
export { MethodKind } from "../../node_modules/@bufbuild/protobuf";

// --- v1.x Message base class ---
// Provides instance methods (toBinary, fromBinary, toJson, fromJson, fromJsonString)
// using v2.x top-level functions, driven by the static `fields` and `runtime` properties
// that generated code sets on each message class.
// This overrides any v2.x export of the same name.
export class Message<T extends Message<T>> {
  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "";
  static readonly fields: any = [];

  constructor(data?: Partial<T>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  toBinary(): Uint8Array {
    return v2.toBinary(this as any);
  }

  toJson(): string {
    return v2.toJson(this as any);
  }

  static fromBinary<U extends Message<U>>(this: new (...args: any[]) => U, bytes: Uint8Array): U {
    return v2.fromBinary(this as any, bytes);
  }

  static fromJson<U extends Message<U>>(this: new (...args: any[]) => U, json: string): U {
    return v2.fromJson(this as any, json);
  }

  static fromJsonString<U extends Message<U>>(this: new (...args: any[]) => U, jsonString: string): U {
    return v2.fromJsonString(this as any, jsonString);
  }

  static equals<U extends Message<U>>(
    this: new (...args: any[]) => U,
    a: U | Record<string, unknown> | undefined,
    b: U | Record<string, unknown> | undefined
  ): boolean {
    return v2.equals(a as any, b as any);
  }

  static create<U extends Message<U>>(
    this: new (...args: any[]) => U,
    data?: Partial<U>
  ): U {
    return v2.create(this as any, data);
  }
}

// --- v1.x proto3 compat object ---
export const proto3 = {
  util: {
    setEnumType(type: any, typeName: string, values: { no: number; name: string }[]): void {
      // v2.x doesn't need enum registration; store for getEnumType lookup
      type._v1_typeName = typeName;
      type._v1_values = values;
    },
    initPartial(data: Record<string, unknown> | undefined, instance: any): void {
      if (data) {
        Object.assign(instance, data);
      }
    },
    newFieldList(fn: () => any[]): any[] {
      return fn();
    },
    equals(messageType: any, a: any, b: any): boolean {
      return v2.equals(a, b);
    }
  },
  getEnumType(type: any): any {
    return type;
  }
};

export type { Message as MessageType };
