import { deepStrictEqual } from 'node:assert';
import { exec } from 'node:child_process';
import { mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises';
import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { parse } from 'node:path';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';

const async_exec = promisify(exec);

interface batch_tcl_request {
  readonly cwd: string;
  readonly phys: Set<string>;
  readonly edn: Set<string>;
  readonly dcp: Set<string>;
  readonly tcl: Set<string>;
};

async function create_batch_tcl({cwd, edn, dcp, tcl}:batch_tcl_request) {
  deepStrictEqual(dcp.size, 1);
  if(tcl.size === 0) {
    deepStrictEqual(edn.size, 0);
  return `set_param tcl.collectionResultDisplayLimit 0
${Array.from(dcp, (item)=> `open_checkpoint {unzip/${item}}`).join('\n')}
report_route_status
close_design
exit
`;
  } else {
    deepStrictEqual(tcl.size, 1);
    const tcl_filename = Array.from(tcl)[0];
    const tcl_lines = (await readFile(`${cwd}/unzip/${tcl_filename}`, 'utf8')).split(/\r?\n/g);
    const top = tcl_lines.flatMap(line => /^set_property top (?<top>\w+) \[current_fileset\]$/.exec(line)?.groups?.top ?? []);
    const part = tcl_lines.flatMap(line => /^link_design -part (?<part>(\w|-)+)$/.exec(line)?.groups?.part ?? []);
    deepStrictEqual(top.length, 1);
    deepStrictEqual(part.length, 1);

    return `set_param tcl.collectionResultDisplayLimit 0
${Array.from(edn, (item)=> `read_edif {unzip/${item}}`).join('\n')}
${Array.from(dcp, (item)=> `read_checkpoint {unzip/${item}}`).join('\n')}
${Array.from(top, (item) => `set_property top {${item}} [current_fileset]`)}
${Array.from(part, (item) => `link_design -part {${item}}`)}
report_route_status
close_design
exit
`;
  }
}

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
      case '{"url":"/validate-routing-zip","method":"PUT"}':
        {
          const TIMESTAMP = JSON.stringify(new Date()).replaceAll(/:|\./g, '-');
          const cwd = `./output/output-${JSON.parse(TIMESTAMP)}-${randomBytes(16).toString('hex')}`;
          await mkdir(cwd, {'recursive': true});
          const wh = await open(`${cwd}/test.zip`,'wx');
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

          const unzip_status = await async_exec(`"C:/Program Files/7-Zip/7z.exe" e -ounzip test.zip`, {cwd, windowsHide: true});
          const phys = new Set<string>();
          const edn = new Set<string>();
          const dcp = new Set<string>();
          const tcl = new Set<string>();
          for(const file of await readdir(`${cwd}/unzip`, {withFileTypes: true})) {
            if(!file.isFile()) { continue; }
            if(parse(file.name).ext === '.phys') { phys.add(file.name); continue; }
            if(parse(file.name).ext === '.edn') { edn.add(file.name); continue; }
            if(parse(file.name).ext === '.dcp') { dcp.add(file.name); continue; }
            if(parse(file.name).ext === '.tcl') { tcl.add(file.name); continue; }
          }

          const batch_tcl = await create_batch_tcl({cwd, phys, edn, tcl, dcp});

          await writeFile(`${cwd}/batch.tcl`, batch_tcl);

          const { stdout, stderr } = await async_exec(`C:/Xilinx/Vivado/2023.1/bin/vivado.bat -mode batch -source batch.tcl -verbose`, {cwd, windowsHide: true});

          res.writeHead(200, {'content-type': 'application/json'});
          res.end(JSON.stringify({
            stdout,
            stderr,
            phys: Array.from(phys),
            edn: Array.from(edn),
            tcl: Array.from(tcl),
            dcp: Array.from(dcp),
            batch_tcl,
          }, null, 2));
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

server.listen({port: 8081, host: '127.0.0.1'});