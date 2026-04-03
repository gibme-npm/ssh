# @gibme/ssh

A simple SSH helper/wrapper built on [ssh2](https://github.com/mscdex/ssh2) with support for command execution and real-time streaming.

## Requirements

- Node.js >= 22

## Installation

```bash
yarn add @gibme/ssh
```

or

```bash
npm install @gibme/ssh
```

## Usage

### Basic Command Execution

```typescript
import SSH from '@gibme/ssh';

const client = new SSH({
    host: '192.168.1.1',
    username: 'admin',
    password: 'password'
});

await client.connect();

const output = await client.exec('ls -la');
console.log(output.toString());

await client.destroy();
```

### Streaming

For long-running or continuous commands, use `stream()` to receive data in real-time:

```typescript
const controller = await client.stream('tail -f /var/log/syslog', {
    separator: '\n',
    loopInterval: 50
});

controller.on('data', (chunk) => {
    console.log(chunk.toString());
});

controller.on('completed', () => {
    console.log('Stream finished');
});

// Cancel the stream at any time
controller.abort();
```

### Events

The SSH client emits the following events:

| Event | Description |
|-------|-------------|
| `ready` | Connection established and authenticated |
| `close` | Connection closed |
| `end` | Connection ended |
| `timeout` | Connection timed out |
| `error` | An error occurred |
| `banner` | Server sent a banner message |
| `greeting` | Server sent a greeting |
| `stream` | Data arrived from a stream command |
| `stream_cancelled` | Stream was cancelled |
| `stream_complete` | Stream completed |

## API Documentation

Full API documentation is available at [https://gibme-npm.github.io/ssh/](https://gibme-npm.github.io/ssh/)

## License

[MIT](https://choosealicense.com/licenses/mit/)
