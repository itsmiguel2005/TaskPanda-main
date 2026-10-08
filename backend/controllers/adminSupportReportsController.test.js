const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSupportReportsPipeline } = require("./adminSupportReportsController");

test("admin support report query paginates open reports and joins only participant summaries", () => {
  const pipeline = buildSupportReportsPipeline("open", 2, 25);
  assert.deepEqual(pipeline[0], { $match: { "supportReports.status": "open" } });
  assert.deepEqual(pipeline[1], { $unwind: "$supportReports" });
  const facet = pipeline.find((stage) => stage.$facet)?.$facet;
  assert.deepEqual(facet.reports.slice(0, 2), [
    { $skip: 25 },
    { $limit: 25 },
  ]);
  assert.ok(facet.reports.some((stage) => stage.$lookup?.as === "reporter"));
  assert.ok(facet.reports.some((stage) => stage.$lookup?.as === "booking"));
});

test("admin support report query can include all report states", () => {
  const pipeline = buildSupportReportsPipeline("all", 1);
  assert.deepEqual(pipeline[0], { $unwind: "$supportReports" });
  assert.equal(pipeline.some((stage) => stage.$match?.["supportReports.status"]), false);
});
