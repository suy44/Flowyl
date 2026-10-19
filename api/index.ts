import router from "../src/index";

export const config = {
  runtime: "edge",
};

/**
 * Vercel Edge Serverless Function handler
 * Dispatches requests to the Flowyl core router
 */
export default async function handler(request: Request) {
  return router.fetch(request);
}
