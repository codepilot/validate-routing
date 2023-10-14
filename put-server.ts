import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, open, rmdir } from 'node:fs/promises';
import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { promisify } from 'node:util';

async function handle_request(req: IncomingMessage, res: ServerResponse<IncomingMessage> & {req: IncomingMessage;}) {
  req.on('error', (err)=> {
    console.log(err);
  });
  try {
    const {url, method, headers: {'content-length': content_length, authorization}} = req;
    if(content_length === undefined || (!/^\d+$/.test(content_length))) {
      console.log(req.headers);
      res.writeHead(501); res.end(); return;
    }
    const content_length_num = parseInt(content_length, 10);
    const j_req = JSON.stringify({url, method});

    switch(j_req) {
      case '{"url":"/validate-routing","method":"PUT"}':
        {
          const TIMESTAMP = JSON.stringify(new Date()).replaceAll(/:|\./g, '-');
          const cwd = `./output/output-${JSON.parse(TIMESTAMP)}-${randomBytes(16).toString('hex')}`;
          await mkdir(cwd, {'recursive': true});
          const wh = await open(`${cwd}/test.dcp`,'wx');
          let data_so_far = 0;
          for await(const chunk of req) {
            if(!Buffer.isBuffer(chunk)) {
              console.log(`!Buffer.isBuffer(chunk)`);
              wh.close();
              res.writeHead(501);
              res.end();
              return;
            }
            data_so_far += chunk.length;

            if(data_so_far > content_length_num) {
              console.log(`data_so_far > content_length_num`);
              await wh.close();
              res.writeHead(501);
              res.end();
              return;
            }
            await wh.write(chunk);
          }
          await wh.close(); 
          if(data_so_far !== content_length_num) {
            console.log(`data_so_far !== content_length_num`);
            res.writeHead(501);
            res.end();
            return;
          }

          res.writeHead(200, {'content-type': 'text/plain', 'X-Accel-Buffering': 'no'});
          const child_process = spawn(`C:/Xilinx/Vivado/2023.1/bin/vivado.bat`, ['-mode', 'batch', '-source', 'F:/validate-routing/source.tcl', '-verbose', 'test.dcp'], {cwd, shell: true, windowsHide: true, timeout: 1800000, stdio: ['ignore', 'pipe', 'ignore']});
          child_process.on("close", async (code)=> {
            res.end();
            await rmdir(cwd, {'recursive': true, maxRetries: 10});
          });
          child_process.on("spawn", ()=> res.write('vivado started\r\n'))
          child_process.stdout.on('data', (data) => {
            res.write(data);
            // console.log(data);
          }); 
          return;
        }
      default:
        console.log(j_req);
        res.writeHead(501);
        res.end();
    }
  } catch(err) {
    console.log(err);
    res.end();
  }
}

const server = createServer(handle_request);

server.on("error", (err)=> {
  console.log(err);
});

server.listen({port: 8080, host: '127.0.0.1'});