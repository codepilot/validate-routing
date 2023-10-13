import { exec } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { promisify } from 'node:util';

const async_exec = promisify(exec);

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
          const cwd = `./output/output-${JSON.parse(TIMESTAMP)}`;
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

          const { stdout, stderr } = await async_exec(`C:/Xilinx/Vivado/2023.1/bin/vivado.bat -mode batch -source F:/validate-routing/source.tcl -verbose test.dcp`, {cwd, windowsHide: true});

          res.writeHead(200, {'content-type': 'application/json'});
          res.end(JSON.stringify({stdout, stderr}));
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