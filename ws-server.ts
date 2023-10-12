import cluster from 'node:cluster';
import { WebSocketServer } from 'ws';
import { run_report } from './run_report.js';
import { availableParallelism } from 'node:os';

const host = '127.0.0.1';
const port = 8081;


if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

  for (let i = 0; i < 1; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
    cluster.fork();
  });

} else {

  const wss = new WebSocketServer({ port, host });

wss.on('connection', async (ws) => {
  ws.on('error', console.error);

  ws.on('message', async (data, isBinary) => {
    if(isBinary) {
      if(Buffer.isBuffer(data)) {
        await run_report(ws, data);
      } else {
        console.log(data);
        throw new TypeError("data not buffer");
      }
    } else {
      console.log(JSON.parse(data.toString()));
    }
  });
});

  console.log(`Worker ${process.pid} started`);
}


