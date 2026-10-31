import { createApp } from "./app.js";
const portIndex = process.argv.indexOf("--port");
const port = Number(
  process.env.PORT || (portIndex >= 0 ? process.argv[portIndex + 1] : 3000),
);
createApp().listen(port, "0.0.0.0", () =>
  console.log(`STERILOG listening on ${port}`),
);
