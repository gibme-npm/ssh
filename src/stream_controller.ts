// Copyright (c) 2024-2025, Brandon Lehmann <brandonlehmann@gmail.com>
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

import { EventEmitter } from 'events';
import { Reader } from '@gibme/bytepack';
import Timer, { sleep } from '@gibme/timer';
import { ClientChannel } from 'ssh2';

export class StreamController extends EventEmitter {
    private readonly reader = new Reader();
    private readonly timer;
    private _done = false;

    constructor (
        private readonly stream: ClientChannel,
        private readonly options: Partial<StreamController.Options> =
        { separator: '\r\n', encoding: 'utf8', loopInterval: 10 }
    ) {
        super();

        this.options.separator ??= '\r\n';
        this.options.encoding ??= 'utf8';
        this.options.loopInterval ??= 10;

        if (this.options.separator.length === 0) {
            throw new Error('separator cannot be empty');
        }

        this.timer = new Timer(options.loopInterval || 10, true);

        this.timer.on('tick', () => {
            this.timer.stop();

            let delimiter = this.delimiter;

            while (delimiter >= 0 && !this.timer.destroyed) {
                this.emit('data', this.reader.bytes(delimiter));

                this.reader.skip(this.options.separator?.length);

                delimiter = this.delimiter;
            }

            this.timer.start();
        });

        this.stream.on('close', async () => {
            /**
             * When the stream closes, and we have not been cancelled
             * then we need to wait a moment for the reader to clear
             */
            while (this.reader.unreadBytes > 0 && !this.timer.destroyed) {
                await sleep(options.loopInterval || 10);
            }

            this.cleanup();

            /**
             * If we have not been cancelled, then our stream completed
             */
            if (this.timer.destroyed && !this.done) {
                this.emit('completed');
            }
        });

        this.stream.pipe(this.reader);
    }

    public get done (): boolean {
        return this._done;
    }

    public abort (): void {
        if (!this.timer.destroyed && !this.done) {
            this.emit('cancelled');
        }

        return this.cleanup();
    }

    private cleanup (): void {
        this._done = true;

        this.timer.destroy();

        this.stream.destroy();
    }

    private get delimiter (): number {
        return this.reader.unreadBuffer.indexOf(
            this.options.separator || '\r\n', 0, this.options.encoding);
    }

    public on(event: 'data', listener: (data: Buffer) => void): this;
    public on(event: 'completed', listener: () => void): this;
    public on(event: 'cancelled', listener: () => void) : this;
    public on (event: any, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public once(event: 'data', listener: (data: Buffer) => void): this;
    public once(event: 'completed', listener: () => void): this;
    public once(event: 'cancelled', listener: () => void) : this;
    public once (event: any, listener: (...args: any[]) => void): this {
        return super.once(event, listener);
    }

    public off(event: 'data', listener: (data: Buffer) => void): this;
    public off(event: 'completed', listener: () => void): this;
    public off(event: 'cancelled', listener: () => void) : this;
    public off (event: any, listener: (...args: any[]) => void): this {
        return super.off(event, listener);
    }
}

export namespace StreamController {
    export type Options = {
        separator: string;
        encoding: BufferEncoding;
        loopInterval: number;
    }
}

export default StreamController;
