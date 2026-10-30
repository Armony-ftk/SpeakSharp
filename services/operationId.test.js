const assert = require("node:assert/strict");
const { test } = require("node:test");

test("operation IDs are op_-prefixed UUID v4 values", async () => {
  const cryptoApi = {
    randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
  };

  const { createOperationId } = require("./operationId");
  const value = createOperationId(cryptoApi);

  assert.match(
    value,
    /^op_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test("secure random fallback sets UUID v4 version and variant bits", async () => {
  const cryptoApi = {
    getRandomValues(bytes) {
      bytes.fill(0);
      return bytes;
    },
  };

  const { createOperationId } = require("./operationId");
  assert.equal(
    createOperationId(cryptoApi),
    "op_00000000-0000-4000-8000-000000000000",
  );
});
