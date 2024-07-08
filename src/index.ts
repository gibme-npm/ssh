// Copyright (c) 2024, Brandon Lehmann <brandonlehmann@gmail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import { Reader } from '@gibme/bytepack';
import { EventEmitter } from 'events';
import Timer from '@gibme/timer';
import { createHash } from 'crypto';

/** @ignore */
const hash = (obj: any) => createHash('sha256')
    .update(JSON.stringify(obj))
    .digest('hex');

export default class SSH extends EventEmitter {
    private readonly client = new Client();
    private readonly streams = new Map<string, ClientChannel>();

    /**
     * Creates a new instance of the class
     *
     * @param config
     */
    constructor (private readonly config: ConnectConfig) {
        super();

        this.config.timeout ??= 2000;
        this.config.tryKeyboard ??= true;

        this.client.on('error', error => this.emit('error', error));
        this.client.on('ready', () => {
            this._connected = true;
            this.emit('ready');
        });
        this.client.on('keyboard-interactive',
            (_name, _instructions, _lang, prompts, finish) => {
                if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
                    return finish([config.password || '']);
                }
            });
        this.client.on('banner', message => this.emit('banner', message));
        this.client.on('greeting', greeting => this.emit('greeting', greeting));
        this.client.on('close', () => {
            this._connected = false;
            this.emit('close');
        });
        this.client.on('end', () => {
            this._connected = false;
            this.emit('end');
        });
        this.client.on('timeout', () => {
            this._connected = false;
            this.emit('timeout');
        });
    }

    private _connected = false;

    /**
     * Returns if the client is connected
     */
    public get connected (): boolean {
        return this._connected;
    }

    public on(event: 'ready', listener: () => void): this;

    public on(event: 'close', listener: () => void): this;

    public on(event: 'end', listener: () => void): this;

    public on(event: 'timeout', listener: () => void): this;

    public on(event: 'error', listener: (error: Error) => void): this;

    public on(event: 'banner', listener: (banner: string) => void): this;

    public on(event: 'greeting', listener: (greeting: string) => void): this;

    public on(event: 'stream', listener: (reader: Buffer) => void): this;

    public on (event: any, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Executes the command on the remote host and returns the result as a Buffer
     *
     * @param command
     */
    public async exec (command: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const reader = new Reader();

            this.client.exec(command, (error, stream) => {
                if (error) return reject(error);

                stream.once('close', (code: number, signal: any) => {
                    if (code !== 0) {
                        return reject(new Error(`Code: ${code}  Signal: ${signal}`));
                    }

                    return resolve(reader.unreadBuffer);
                });

                stream.pipe(reader);
            });
        });
    }

    /**
     * Runs a command that initiates a 'stream' of data coming back from the remote device.
     * The data is separated by the specified 'separator' and emitted as a Buffer via
     * the `stream` event
     *
     * @param command
     * @param options
     * @returns method to cancel the stream
     */
    public async stream (
        command: string,
        options: Partial<{
            separator: string;
            encoding: BufferEncoding;
            loopInterval: number
        }> = { separator: '\r\n', encoding: 'utf8', loopInterval: 10 }
    ): Promise<() => void> {
        options.separator ??= '\r\n';
        options.encoding ??= 'utf8';
        options.loopInterval ??= 10;

        if (options.separator.length === 0) {
            throw new Error('separator cannot be empty');
        }

        const sleep = async (timeout: number) =>
            new Promise(resolve => setTimeout(resolve, timeout));

        return new Promise((resolve, reject) => {
            const reader = new Reader();

            const timer = new Timer(options.loopInterval || 10, true);

            timer.on('tick', () => {
                timer.stop();

                let delimiter = reader.unreadBuffer.indexOf(
                    options.separator || '\r\n', 0, options.encoding);

                while (delimiter >= 0) {
                    this.emit('stream', reader.bytes(delimiter));

                    reader.skip(options.separator?.length);

                    delimiter = reader.unreadBuffer.indexOf(
                        options.separator || '\r\n', 0, options.encoding);
                }

                timer.start();
            });

            this.client.exec(command, (error, stream) => {
                if (error) {
                    timer.destroy();

                    return reject(error);
                }

                const id = hash({ command, ...options });

                stream.on('close', async () => {
                    while (reader.unreadBytes > 0) {
                        await sleep(options.loopInterval || 10); // wait for the reader to clear
                    }

                    timer.destroy();
                });

                stream.pipe(reader);

                this.streams.set(id, stream);

                return resolve(async () => {
                    while (reader.unreadBytes > 0) {
                        await sleep(options.loopInterval || 10); // wait for the reader to clear
                    }

                    timer.destroy();

                    this.streams.delete(id);

                    stream.destroy();
                });
            });
        });
    }

    /**
     * Connects to the remote system
     */
    public async connect (): Promise<void> {
        return new Promise((resolve, reject) => {
            function handleError (error: Error) {
                return reject(error);
            }

            this.client.once('error', handleError);
            this.client.once('ready', () => {
                this.client.off('error', handleError);

                return resolve();
            });

            this.client.connect(this.config);
        });
    }

    /**
     * Destroy the underlying SSH connection
     */
    public async destroy (): Promise<void> {
        this.client.destroy();
    }

    /**
     * Disconnects the underlying SSH connection
     */
    public async end (): Promise<void> {
        this.client.end();
    }
}
