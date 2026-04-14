# 개발 중 문제 해결 가이드 (Troubleshooting Guide)

이 문서는 CTNR Optimizer 개발 중 발생할 수 있는 일반적인 오류와 대응 방법을 설명합니다.

## 1. 터미널 멈춤 현상 (하얀 화면)
브라우저에 접속했을 때 화면이 하얗게만 나오고 반응이 없다면, 터미널이 **'선택 모드'**일 가능성이 큽니다.

*   **증상**: 터미널 제목 표시줄에 `선택` 또는 `Select`라는 단어가 포함되어 있음.
*   **원인**: 터미널 내부를 마우스로 클릭하여 텍스트가 선택되면 프로세스가 일시 정지됩니다.
*   **해결**: 터미널 창에서 `Esc` 키를 누르거나 마우스 오른쪽 버튼을 클릭하여 선택을 해제하세요.

## 2. 포트 충돌 오류 (EADDRINUSE)
`Error: listen EADDRINUSE: address already in use 127.0.0.1:4000` 오류가 발생할 때입니다.

*   **원인**: 이전 실행의 잔재가 남아있거나 다른 프로그램이 4000번 포트를 사용 중입니다.
*   **해결**: `run-dev.bat`을 실행하면 자동으로 기존 프로세스를 종료하고 다시 시작합니다. 수동으로 하려면 터미널에서 다음 명령을 실행하세요:
    ```powershell
    Get-NetTCPConnection -LocalPort 4000 | Stop-Process -Id {$_.OwningProcess} -Force
    ```

## 3. 캐시 손상 오류 (Turbopack Cache Error)
`Unable to read next free task id from database` 또는 SST 파일 관련 오류가 발생할 때입니다.

*   **원인**: `.next` 폴더 내부의 캐시 파일이 깨졌습니다.
*   **해결**: 다음 명령어를 사용하여 캐시를 지우고 다시 실행하세요:
    ```bash
    npm run dev:clean
    ```

## 4. 권한 오류 (Execution Policy)
`npm` 스크립트 실행 시 `UnauthorizedAccess` 오류가 발생할 때입니다.

*   **해결**: `npm` 대신 `npm.cmd`를 사용하거나, `run-dev.bat`를 통해 실행하세요.
