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

import { describe, it } from 'mocha';
import SSH from '../src/index';
import { config } from 'dotenv';
import assert from 'assert';

config();

describe('Unit Tests', async () => {
    const client = new SSH({
        host: process.env.SSH_HOST,
        username: process.env.SSH_USER,
        password: process.env.SSH_PASSWORD
    });

    it('Connect()', async function () {
        try {
            await client.connect();
        } catch {
            this.skip();
        }
    });

    it('Exec()', async function () {
        if (!client.connected) return this.skip();

        const result = await client.exec('/ip address print terse without-paging');

        assert.ok(result.length !== 0);
    });

    it('Stream()', async function () {
        if (!client.connected) return this.skip();

        const stream = await client.stream('/ping 1.1.1.1');

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                stream.abort();

                return reject(new Error('Could not stream properly'));
            }, 2000);

            stream.on('data', data => {
                if (data.length > 0) {
                    console.log(data.toString());

                    stream.abort();

                    clearTimeout(timeout);

                    return resolve();
                }
            });

            stream.on('completed', () => {
                console.log('stream completed');
            });

            stream.on('cancelled', () => {
                console.log('stream cancelled');
            });
        });
    });

    it('Destroy()', async function () {
        await client.destroy();
    });
});
