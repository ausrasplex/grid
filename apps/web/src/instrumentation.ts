// Runs once when the server starts. Brings built-in roles up to date
// with the blocks in this build, so deploying a new stage gives
// existing companies' Owners/Foremen/etc. the new permissions.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("./blocks");
  const { syncSystemRoles } = await import("@grid/block-companies");
  try {
    const changed = await syncSystemRoles();
    if (changed) console.log(`[startup] updated permissions on ${changed} built-in role(s)`);
  } catch (error) {
    // Don't block startup (e.g. before the first migration has run).
    console.error("[startup] couldn't sync built-in roles", error);
  }
  // Business pictures for businesses that had a Branding logo before pictures existed.
  try {
    const { pictureFromExistingLogos } = await import("@grid/block-templates");
    const made = await pictureFromExistingLogos();
    if (made) console.log(`[startup] made ${made} business picture(s) from Branding logos`);
  } catch (error) {
    console.error("[startup] couldn't make business pictures from logos", error);
  }
  // Addresses saved as one line before Grid kept them in parts.
  try {
    const { splitExistingAddresses } = await import("./lib/split-addresses");
    const split = await splitExistingAddresses();
    if (split) console.log(`[startup] split ${split} address(es) into street, suburb, state and postcode`);
  } catch (error) {
    console.error("[startup] couldn't split existing addresses", error);
  }
  // Scheduled jobs (storage clean-up). Failing to start them mustn't stop the app.
  try {
    const { startJobs } = await import("./lib/jobs");
    await startJobs();
  } catch (error) {
    console.error("[startup] couldn't start scheduled jobs", error);
  }
}
