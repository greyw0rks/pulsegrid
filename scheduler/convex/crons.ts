import { cronJobs, makeFunctionReference } from "convex/server";

const crons = cronJobs();
crons.interval("BOT Chain RPC monitoring", { minutes: 5 }, makeFunctionReference<"action">("monitor:run"));
export default crons;
