# Yople Realtime Database Rules 병합 안내

`firebase-database-rules-yople.json`은 전체 Rules 파일이 아니라 `/rules/apps/yople`에 추가할 병합 조각이다. Firebase Console에서 현재 운영 Rules를 먼저 내보내고, 기존 `apps/yoki` 등 다른 노드를 그대로 둔 채 이 파일의 `apps.yople` 객체만 병합해야 한다.

이 패치는 `auth != null`을 요구한다. 현재 기준 Yoki/Yople 클라이언트에는 Firebase Web App config와 Firebase Auth SDK가 없으므로, 이 Rules를 적용하기 전에 Firebase Console에서 Anonymous Auth를 활성화하고 Yople에 해당 프로젝트의 공개 Web App config를 제공해야 한다. 관리자 키나 서비스 계정 키를 클라이언트에 넣으면 안 된다.

현재 프로젝트의 공개 REST 호환 Rules를 그대로 둘 경우 Yople 백업 기능은 동작할 수 있지만, URL을 아는 제3자가 데이터를 읽거나 쓸 수 있으므로 운영 보안 구성으로 간주할 수 없다.
