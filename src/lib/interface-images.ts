/**
 * Returns the list of interface screenshot paths under /UI_images.
 *
 * Previously this used a server function with readdirSync, which works in dev
 * but fails on Vercel's serverless/edge environment where the public directory
 * is served from a CDN and is not accessible via the Node.js filesystem.
 * The list is now hardcoded and must be updated when new screenshots are added.
 */
export async function listInterfaceImages(): Promise<string[]> {
  return [
    "/UI_images/Approvals.png",
    "/UI_images/Attendance.png",
    "/UI_images/Files.png",
    "/UI_images/Payslips.png",
    "/UI_images/Profile.png",
    "/UI_images/TO-DO_Kanban.png",
    "/UI_images/Tasks.png",
    "/UI_images/corporate-hub.png",
    "/UI_images/corporate-hub_HR-Policies.png",
    "/UI_images/corporate-hub_Induction.png",
    "/UI_images/corporate-hub_Internal-Forum.png",
    "/UI_images/corporate-hub_Memories.png",
    "/UI_images/corporate-hub_Team.png",
    "/UI_images/corporate-hub_shared-resources.png",
    "/UI_images/dashboard.png",
  ];
}
