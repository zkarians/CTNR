# CTNR 모바일 풀스크린 앱 사용 및 APK 변환 가이드

## 1. [추천] 주소창 없는 PWA (홈 화면에 앱으로 설치)
별도의 파일 설치나 앱스토어 설치 없이, 모바일 브라우저 접속 후 **홈 화면에 추가**를 누르시면 스마트폰 바탕화면에 **CTNR 전용 앱** 아이콘이 생성되며 **주소창이 완벽히 제거된 풀스크린 앱**으로 실행됩니다.

### 📱 Android (삼성 인터넷 / Chrome 등)
1. 스마트폰 브라우저로 CTNR 웹 주소에 접속합니다.
2. 화면 하단에 뜬 **[1초만에 앱 설치하기]** 배너를 클릭하거나, 브라우저 우측 상단/하단 메뉴 `⋮` 선택 후 **[앱 설치]** 또는 **[홈 화면에 추가]**를 누릅니다.
3. 바탕화면에 생성된 **CTNR** 앱 아이콘을 터치하여 실행합니다.

### 🍎 iOS (아이폰 / 아이패드 Safari)
1. Safari 브라우저로 CTNR 웹 주소에 접속합니다.
2. 하단 중앙의 **[공유 ⎋]** 버튼을 누릅니다.
3. 메뉴를 내려 **[홈 화면에 추가 ➕]**를 누른 뒤, 우측 상단 **[추가]**를 누릅니다.
4. 바탕화면에 생성된 **CTNR** 앱 아이콘을 터치하여 실행합니다.

---

## 2. Android 전용 APK 파일 직접 추출 방법 (Trusted Web Activity / Bubblewrap)

스마트폰에 직접 설치할 수 있는 `.apk` 파일 형태가 필요한 경우 아래 명령어로 생성할 수 있습니다.

### 필요 조건
- Node.js 및 Java JDK (17 이상), Android SDK 설치

### APK 생성 명령 (터미널)
```bash
# 1. Bubblewrap CLI 실행
npx @bubblewrap/cli init --manifest=https://your-domain.com/manifest.json

# 2. APK 파일 빌드
npx @bubblewrap/cli build
```
빌드가 완료되면 `app-release-signed.apk` 파일이 생성되어 스마트폰에 직접 설치 가능합니다.
