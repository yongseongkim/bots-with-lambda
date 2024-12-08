import { handler } from "./index.js";

(async () => {
  const result = await handler()
  console.log(result)
})()
