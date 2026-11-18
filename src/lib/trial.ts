import { createServerFn } from "@tanstack/react-start";
import { enrollTrialAndProvision, type EnrollTrialParams } from "./trial-provisioner.server";

export const enrollTrialServerFn = createServerFn({ method: "POST" })
  .validator((d: EnrollTrialParams) => d)
  .handler(async ({ data }) => {
    return await enrollTrialAndProvision(data);
  });
