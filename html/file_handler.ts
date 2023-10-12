export {};

class WsConsole {
  readonly #ws: WebSocket = new WebSocket('ws://127.0.0.1/ws');
  readonly #bound_watch_send_bytes = this.watch_send_bytes.bind(this);
  readonly #to_send = new Array<ArrayBuffer>();
  readonly #el_div = document.body.appendChild(document.createElement("div"));
  readonly #el_status = this.#el_div.appendChild(document.createElement("div"));
  readonly #el_div_commands: HTMLDivElement[] = [];
  readonly #el_pre_commands: HTMLPreElement[] = [];
  static readonly state_enum = new Map<number, string>([
    [WebSocket.CONNECTING, 'connecting'],
    [WebSocket.OPEN, 'open'],
    [WebSocket.CLOSING, 'closing'],
    [WebSocket.CLOSED, 'closed'],
  ])

  constructor() {
    this.#el_status.id = 'status';
    this.#el_div.id = 'console';
    this.#ws.addEventListener("open", this.on_open.bind(this));
    this.#ws.addEventListener("close", this.on_close.bind(this));
    this.#ws.addEventListener("error", this.on_error.bind(this));
    this.#ws.addEventListener("message", this.on_message.bind(this));
    requestAnimationFrame(this.#bound_watch_send_bytes);
  }
  watch_send_bytes() {
    this.#el_status.innerText = `Websockets(${WsConsole.state_enum.get(this.#ws.readyState)}) send buffer: ${this.#ws.bufferedAmount.toLocaleString("en-us")} bytes`;
    requestAnimationFrame(this.#bound_watch_send_bytes);
  }
  on_open(ev: Event) {
    for(;this.#to_send.length;) {
      const ab = this.#to_send.shift();
      if(!ab) break;
      this.#ws.send(ab);
    }
  }
  on_close(ev: CloseEvent) {

  }
  on_error(ev: Event) {

  }
  on_message(ev: MessageEvent) {
    const data = JSON.parse(ev.data as string) as unknown;
    if(typeof data === 'object' && data !== null) {
      const {console, command, result} = data as {[index: string]: string};
      if(typeof console === 'string') {
        const pre_el = this.#el_pre_commands.at(-1);
        if(pre_el) {
          pre_el.innerText = console;
        }
      }
      if(typeof command === 'string') {
        if(Array.isArray(result)) {
          const pre_el = this.#el_pre_commands.at(-1);
          if(pre_el) {
            pre_el.innerText = result.join('\n');
          }
        } else {
          const cmd_div = this.#el_div.appendChild(document.createElement("div"));
          this.#el_div_commands.push(cmd_div);
          cmd_div.innerText = command;
          this.#el_pre_commands.push(cmd_div.appendChild(document.createElement("pre")));
        }
      }
    }
  }
  send_file(ab: ArrayBuffer) {
    if(this.#ws.readyState === WebSocket.OPEN) {
      const cmd_div = this.#el_div.appendChild(document.createElement("div"));
      this.#el_div_commands.push(cmd_div);
      cmd_div.innerText = "send file";
      this.#el_pre_commands.push(cmd_div.appendChild(document.createElement("pre")));
      this.#ws.send(ab);
      return;
    }
    this.#to_send.push(ab);
  }
}

const el_file_div = document.createElement('div');
const el_input = document.createElement('input');
el_input.type = "file";
el_input.multiple = true;
el_input.onchange = async(ev: Event) => {
  if(el_input.files) {
    Array.from(el_input.files ?? [], async(file) => {
      wsc.send_file(await file.arrayBuffer());
    });
  }
};

el_file_div.append(el_input);
document.body.append(el_file_div);

const wsc = new WsConsole();

