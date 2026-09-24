const apiUrl = process.env.API_URL || "http://localhost:3000";

async function checkHealth() {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/health`);
  const body = await response.json();

  console.log(`${response.status} ${JSON.stringify(body)}`);

  if (!response.ok || body.mongo !== "connected") {
    process.exitCode = 1;
  }
}

checkHealth().catch((error) => {
  console.error(`Health check failed: ${error.message}`);
  process.exitCode = 1;
});