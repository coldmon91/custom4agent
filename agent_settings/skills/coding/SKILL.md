---
name: coding
description: Read when you need to write code for socket programming, multi-threading, or other programming tasks.
---

# 코드를 작성할때 따라야하는 규칙

## Socket Programming

- TCP/TLS/UDP 수신 코드를 작성할 때는 반드시 수신되는 데이터는 분할되어 수신될 수 있다는 점을 고려해야 한다. 
  - 예를 들어 송신자가 1000바이트의 TCP 데이터를 전송했다면, 수신자는 500 바이트씩 2번에 걸쳐서 수신할 수도 있다.
  - 일반적으로 헤더에 데이터 길이를 명시하고, 수신자는 적어도 헤더의 길이만큼은 먼저 수신한다, 그 후 헤더에 명시된 길이만큼 남은 데이터를 수신한다.

## Multi-Thread Programming

- 반드시 어떤 자원이 공유자원인지 마크하고, 접근할 때는 반드시 접근 동기화 처리를 해야 한다.
