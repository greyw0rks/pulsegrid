import { ZodError } from "zod";
import { addEndpoint, authorizeOperator } from "@/lib/configuration";

export async function POST(request: Request) {
  if (!authorizeOperator(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = await addEndpoint(await request.json());
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    const message = error instanceof ZodError ? "Invalid endpoint configuration" : error instanceof Error ? error.message : "Endpoint could not be added";
    return Response.json({ error: message }, { status: 400 });
  }
}
