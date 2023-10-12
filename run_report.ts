import { deepStrictEqual } from 'node:assert';
import {spawn} from 'node-pty';
import type { WebSocket } from 'ws';
import { writeFile } from 'node:fs/promises';


export function throw_undefined(): never {
  throw new TypeError('undefined');
}

export type promise_internal = {resolve: (str: string)=> void, reject: (str: string)=> void};

export async function run_report(ws: WebSocket, buf: Buffer) {
  const ptyProcess = spawn(`C:/Xilinx/Vivado/2023.1/bin/vivado.bat`, [`-mode`, `tcl`], {
    name: `xterm-color`,
    cols: 1024,
    rows: 1024,
    cwd: process.env.HOME,
    env: process.env,
    useConpty: true
  });

  ws.on("error", ()=> { ptyProcess.kill(); })
  ws.on("close", ()=> { ptyProcess.kill(); })

  const data_parts: string[] = [];
  const prompts: string[] = [];
  const prompt_proms: promise_internal[] = [];

  ptyProcess.onData((data) => {
    // process.stdout.write(data);

    data_parts.push(data);
    const data_parts_joined = data_parts.join('');
    const total_data = data_parts_joined.replaceAll(/(\x1b\[\d+;\d+H)/g, '\n').replaceAll(/(\x1b\[\d*C)/g, ' ').replaceAll(
      /(\x1b\[\?25l)|(\x1b\[\?25h)|(\x1b\[2J)|(\x1b\[m)|(\x1b\[H)|(\x1b\]0;)/g,
      '');

    if (/\x1b/.test(total_data)) {
      console.log(JSON.stringify(total_data));
      throw new Error('escape sequence found');
    }

    ws.send(JSON.stringify({console: total_data}));

    const lines = total_data.split(/\r?\nVivado% /g);

    const lastLine: string = lines.pop() ?? throw_undefined();
    data_parts.length = 0;
    data_parts.push(lastLine);

    prompts.push.apply(prompts, lines);
    while (Math.min(prompt_proms.length, prompts.length) > 0) {
      const prompt_n: string = prompts.shift() ?? throw_undefined();
      const prompt_prom_n = prompt_proms.shift() ?? throw_undefined();
      if (prompt_n.includes(' User Exception: ') || prompt_n.includes(' Command failed: ')) {
        prompt_prom_n.reject(prompt_n);
      } else {
        prompt_prom_n.resolve(prompt_n);
      }
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log('killed', exitCode, signal);
  });


  function make_promise_object() {
    const ret: promise_internal[] = [];
    const prom = new Promise<string>((resolve, reject) => ret.push({ resolve, reject }));
    prompt_proms.push.apply(prompt_proms, ret);
    return prom;
  }

  async function exec(command: string): Promise<{ command: string; result: string[]; }> {
    ws.send(JSON.stringify({command}));
    ptyProcess.write(`${command}\r`);
    const initial_result: string = (await make_promise_object());
    const beginning_index = initial_result.indexOf(command);
    deepStrictEqual(beginning_index, 0);
    const result = initial_result.slice(command.length).split('\r\n').filter(line => line.length > 0);
    ws.send(JSON.stringify({command, result}));
    return { command, result };
  }


  try {
    await make_promise_object();

    const TIMESTAMP = JSON.stringify(new Date()).replaceAll(/:|\./g, '-');
    const outputDir = `./output-${JSON.parse(TIMESTAMP)}`;
    await exec(`set outputDir ${outputDir}`);
    await exec(`file mkdir $outputDir`);

    await exec(`set_param general.maxThreads 32`);
    await exec(`set_param tcl.collectionResultDisplayLimit 0`);

    await writeFile(`${outputDir}/temp.dcp`, buf);
    await exec(`open_checkpoint ${outputDir}/temp.dcp`);
    await exec(`report_route_status`);
    await exec(`close_design`);

  } catch (err) {
    console.log('caught', err);

  } finally {
    await exec(`exit`);
    // ptyProcess.kill();
  }
}
