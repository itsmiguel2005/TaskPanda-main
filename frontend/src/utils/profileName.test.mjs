import test from "node:test";
import assert from "node:assert/strict";
import { getProfileNameFields } from "./profileName.mjs";

test("profile hydration keeps an explicitly blank middle name blank", () => {
  assert.deepEqual(
    getProfileNameFields({
      fullName: "Miguel Eduardo Calimlim",
      firstName: "Miguel Eduardo",
      middleName: "",
      lastName: "Calimlim",
    }),
    {
      firstName: "Miguel Eduardo",
      middleName: "",
      lastName: "Calimlim",
    },
  );
});

test("profile hydration infers a middle name when the field is absent", () => {
  assert.deepEqual(
    getProfileNameFields({ fullName: "Juan Santos Cruz" }),
    {
      firstName: "Juan",
      middleName: "Santos",
      lastName: "Cruz",
    },
  );
});
