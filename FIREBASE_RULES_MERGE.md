# Yople Realtime Database 공개 REST 정책

## 적용 금지 안내

`firebase-database-rules-yople.json`은 현재 동작과 검증 조건을 기록한 **비배포형 문서**다. Firebase Console, Firebase CLI 또는 CI에서 이 파일을 Rules 전체 파일로 업로드하거나 자동 적용하면 안 된다. 파일 최상위의 `deployable` 값도 `false`로 고정되어 있다.

이 저장소에서는 Firebase Rules를 변경하지 않는다. 실제 운영 Rules 원문은 관리자 권한 없이 조회할 수 없었으며, 로그인 없는 실제 요청으로 `/apps/yople/` 아래 read/write/delete가 허용된다는 동작만 확인했다.

## 최종 연결 정책

- Firebase Authentication을 사용하지 않는다.
- Google 로그인, 익명 로그인, 사용자 UID를 사용하지 않는다.
- Firebase JavaScript SDK로 전환하지 않는다.
- 기존 Yoki와 같은 Realtime Database REST 방식을 유지한다.
- 로그인 없이 Yople 백업을 모든 기기에서 조회하고 복구할 수 있다.
- 앱의 공통 네트워크 래퍼는 정규화된 `/apps/yople/` 경로만 허용한다.
- 실제 백업 기능은 `/apps/yople/backups/{timestamp}`와 `/apps/yople/backupIndex/{timestamp}`만 사용한다.
- `/apps/yoki/`, 루트 `/backups`, 루트 `/backupIndex`, `/users`, 데이터베이스 루트에는 요청하지 않는다.

## 보안상 주의사항

공개 REST 정책에서는 데이터베이스 URL을 아는 제3자의 접근을 Firebase Authentication으로 차단할 수 없다. 앱 내부의 경로 제한, `appId: yople`, schema version, Stats 급감 검사 및 SHA-256 검사는 Yople 클라이언트의 오작동과 교차 앱 접근을 막기 위한 안전장치이지 서버 측 사용자 인증을 대체하지 않는다.

`firebase-database-rules-yople.json` 안의 `referenceValidationFragmentNotForAutomaticDeployment`는 기존 운영 Rules 관리자가 수동 검토할 수 있도록 schema validation 예시만 기록한다. 이는 전체 Rules가 아니며 기존 Yoki 노드와 병합되었다고 가정해서는 안 된다.
