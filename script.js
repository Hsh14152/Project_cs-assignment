let uploadedFile = null;
let analysisResults = null;

document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('fileInput')
    .addEventListener('change', handleFileSelect);

  document.getElementById('uploadBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('fileInput').click();
  });

  setupDragDrop();
});

function saveApiKey() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();

  if (!apiKey) {
    document.getElementById('apiKeyStatus').textContent =
      '✗ API 키를 입력해주세요';
    document.getElementById('apiKeyStatus').className = 'api-key-status error';
    return;
  }

  if (!apiKey.startsWith('AIza')) {
    document.getElementById('apiKeyStatus').textContent =
      '✗ 올바른 Gemini API 키 형식이 아닙니다';
    document.getElementById('apiKeyStatus').className = 'api-key-status error';
    return;
  }

  localStorage.setItem('gemini_api_key', apiKey);

  document.getElementById('apiKeyStatus').textContent =
    '✓ API 키가 저장되었습니다!';
  document.getElementById('apiKeyStatus').className = 'api-key-status success';
  document.getElementById('uploadSection').style.display = 'block';

  setTimeout(() => {
    document
      .getElementById('uploadSection')
      .scrollIntoView({ behavior: 'smooth' });
  }, 500);
}

function setupDragDrop() {
  const uploadArea = document.getElementById('uploadArea');

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    handleFile(file);
  }
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 업로드 가능합니다.');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert('파일 크기는 10MB를 초과할 수 없습니다.');
    return;
  }

  uploadedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('previewImage').src = e.target.result;
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('previewSection').style.display = 'block';
    document.getElementById('exampleSection').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  uploadedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadArea').style.display = 'block';
  document.getElementById('previewSection').style.display = 'none';
  document.getElementById('exampleSection').style.display = 'block';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function analyzeImage() {
  console.log('버튼 클릭됨');

  if (!uploadedFile) {
    alert('이미지를 먼저 업로드해주세요.');
    return;
  }

  document.getElementById('previewSection').style.display = 'none';
  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('results').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
  document.getElementById('analyzeBtn').disabled = true;

  const loadingText = document.getElementById('loadingText');

  let progress = 0;

  const progressInterval = setInterval(() => {
    if (progress < 90) {
      progress += Math.random() * 10;

      progress = Math.min(progress, 90);

      document.getElementById('progressBar').style.width = progress + '%';

      document.getElementById('progressText').textContent =
        Math.floor(progress) + '%';

      if (progress > 20) {
        loadingText.textContent = '이미지 OCR 분석 중...';
      }

      if (progress > 45) {
        loadingText.textContent = '프로세스 정보를 정리하는 중...';
      }

      if (progress > 70) {
        loadingText.textContent = 'AI가 시스템 상태를 분석하는 중...';
      }
    }
  }, 300);

  try {
    updateProgress(10, '이미지를 준비하는 중...');

    const base64Image = await fileToBase64(uploadedFile);

    const mimeType = uploadedFile.type || 'image/png';

    updateProgress(30, 'Gemini 2.5 Flash로 이미지 분석 중...');

    const processes = await analyzeWithGeminiVision(base64Image, mimeType);

    clearInterval(progressInterval);

    document.getElementById('progressBar').style.width = '100%';

    document.getElementById('progressText').textContent = '100%';

    loadingText.textContent = '분석 완료!';

    updateProgress(100, '분석 완료!');

    if (!processes || processes.length === 0) {
      showError(
        '프로세스 정보를 찾을 수 없습니다.\n\n작업관리자의 프로세스/세부정보 탭이 잘 보이는 스크린샷으로 다시 시도해주세요.',
      );
      return;
    }

    analysisResults = processes;

    setTimeout(() => {
      displayResults(analysisResults);
    }, 500);
  } catch (error) {
    clearInterval(progressInterval);

    console.error('분석 에러:', error);

    showError('분석 중 오류가 발생했습니다.\n\n' + error.message);
  } finally {
    document.getElementById('analyzeBtn').disabled = false;
  }
}

async function analyzeWithGeminiVision(base64Image, mimeType) {
  const prompt = `이 이미지는 Windows 작업관리자 스크린샷입니다.
이미지에서 프로세스 목록을 분석하여 반드시 JSON 배열만 반환하세요. 다른 텍스트, 마크다운 코드블록 없이 [ 로 시작해서 ] 로 끝나야 합니다.

각 항목 형식:
{"name":"프로세스명","memory":MB숫자,"category":"safe/caution/critical","description":"한글로 상세한 설명(종료 시 영향, 역할 등 포함)"}

카테고리 기준 (아래 기준을 따르세요):

safe (종료 가능한 일반 앱):
- 브라우저: Chrome, Edge, Firefox, Whale 등
- 메신저/SNS: 카카오톡, Discord, Slack 등
- 개발 도구: VS Code, IntelliJ, PyCharm 등
- 게임 및 게임 관련: Steam, 게임 실행 파일 등
- 미디어: Spotify, VLC, 팟플레이어 등
- 작업관리자 (Taskmgr.exe) ← 반드시 safe
- 파일 탐색기 (explorer.exe 제외, 별도 창으로 열린 경우) ← safe
- 기타 사용자가 직접 실행한 앱

caution (주의 필요, 종료 시 일부 기능 영향):
- 백신/보안: AhnLab, V3, Windows Defender, MalwareBytes 등
- 드라이버 관련 서비스
- OneDrive, Google Drive 동기화 프로세스
- 프린터/하드웨어 관련 유틸리티

critical (절대 종료 금지 - Windows 핵심 시스템만):
- System, System Idle Process
- explorer.exe (바탕화면/시작메뉴 담당, 단 파일 탐색기 창이 아님)
- dwm.exe (화면 렌더링)
- csrss.exe (클라이언트 서버 런타임)
- winlogon.exe (로그인)
- lsass.exe (보안 인증)
- svchost.exe (서비스 호스트)
- wininit.exe, smss.exe, ntoskrnl.exe

memory는 MB 단위 숫자만. 읽기 어려우면 0.`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };
  console.log('API 요청 시작');
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API 호출 실패');
  }

  const data = await response.json();

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('Gemini로부터 응답을 받지 못했습니다.');
  }

  const textResponse = data.candidates[0].content.parts[0].text;
  console.log('Gemini 응답:', textResponse);

  return safeParseJSON(textResponse);
}

function safeParseJSON(text) {
  let jsonText = text.trim();

  jsonText = jsonText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  jsonText = jsonText.trim();

  const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    jsonText = arrayMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    const values = Object.values(parsed);
    const arr = values.find((v) => Array.isArray(v));
    if (arr) return arr;
  } catch (e) {
    console.error('JSON 파싱 실패:', e);
    console.error('파싱 시도한 텍스트:', jsonText);
    throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
  }

  throw new Error('프로세스 목록을 찾을 수 없습니다.');
}

function updateProgress(percentage, message) {
  document.getElementById('progressBar').style.width = percentage + '%';
  document.getElementById('progressText').textContent = percentage + '%';
  document.getElementById('loadingSubtext').textContent = message;
}

function displayResults(processes) {
  const statsDiv = document.getElementById('stats');
  const processListDiv = document.getElementById('processList');

  const safeProcesses = processes.filter((p) => p.category === 'safe');
  const criticalProcesses = processes.filter((p) => p.category === 'critical');
  const cautionProcesses = processes.filter((p) => p.category === 'caution');

  const safeMemory = safeProcesses.reduce((sum, p) => sum + (p.memory || 0), 0);

  statsDiv.innerHTML = `
        <div class="stat-card">
            <h3>인식된 프로세스</h3>
            <div class="value">${processes.length}</div>
        </div>
        <div class="stat-card safe">
            <h3>안전하게 종료 가능</h3>
            <div class="value">${safeProcesses.length}</div>
        </div>
        <div class="stat-card warning">
            <h3>확보 가능한 메모리</h3>
            <div class="value">${safeMemory.toFixed(0)} MB</div>
        </div>
    `;

  let listHTML = '';

  if (safeProcesses.length > 0) {
    listHTML += generateCategoryHTML(
      'safe',
      safeProcesses,
      '✅ 안전하게 종료 가능한 프로세스',
    );
  }

  if (cautionProcesses.length > 0) {
    listHTML += generateCategoryHTML(
      'caution',
      cautionProcesses,
      '⚠️ 확인 후 종료 권장',
    );
  }

  if (criticalProcesses.length > 0) {
    listHTML += generateCategoryHTML(
      'critical',
      criticalProcesses,
      '🚫 종료하면 안되는 시스템 프로세스',
    );
  }

  processListDiv.innerHTML = listHTML;

  document.getElementById('loadingSection').style.display = 'none';
  document.getElementById('results').style.display = 'block';

  document
    .getElementById('results')
    .scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function generateCategoryHTML(category, processes, title) {
  const statusClass =
    category === 'safe'
      ? 'status-safe'
      : category === 'caution'
        ? 'status-caution'
        : 'status-critical';
  const statusText =
    category === 'safe'
      ? '종료 가능'
      : category === 'caution'
        ? '주의 필요'
        : '종료 금지';

  const sortedProcesses = [...processes].sort(
    (a, b) => (b.memory || 0) - (a.memory || 0),
  );

  return `
        <div class="process-category">
            <div class="category-header ${category}">
                ${title} (${processes.length}개)
            </div>
            ${sortedProcesses
              .map(
                (p) => `
                <div class="process-item">
                    <div class="process-info">
                        <div class="process-name">${p.name}</div>
                        <div class="process-memory">메모리 사용량: ${(p.memory || 0).toFixed(1)} MB</div>
                        <div class="process-description">${p.description}</div>
                    </div>
                    <span class="process-status ${statusClass}">${statusText}</span>
                </div>
            `,
              )
              .join('')}
        </div>
    `;
}

function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('loadingSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'block';
}

function resetAnalysis() {
  analysisResults = null;
  removeImage();
  document.getElementById('results').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
  document.getElementById('loadingSection').style.display = 'none';
  document
    .getElementById('uploadSection')
    .scrollIntoView({ behavior: 'smooth' });
  document.getElementById('summarySection').style.display = 'none';
  document.getElementById('summaryContent').textContent = '';
}

async function generateSummary() {
  if (!analysisResults || analysisResults.length === 0) {
    alert('분석 결과가 없습니다.');
    return;
  }

  const summaryButton = document.querySelector('.btn-summary');

  summaryButton.disabled = true;
  summaryButton.textContent = '⏳ AI 요약 생성 중...';

  try {
    const prompt = `
다음은 Windows 작업관리자 프로세스 분석 결과입니다.

${JSON.stringify(analysisResults, null, 2)}

해야 할 작업:
- 현재 PC 상태를 짧고 핵심적으로 요약
- 메모리를 많이 사용하는 주요 원인 설명
- 종료 추천 프로세스 언급
- 실제로 체감 성능 향상이 있을지 설명
- 3~5문장 이내로 작성
- 한국어로 작성
- 불필요한 인사말 금지
`;

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
      },
    };

    const response = await fetch('/api/analyze', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '요약 생성 실패');
    }

    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!summary) {
      throw new Error('AI 응답 없음');
    }

    document.getElementById('summaryContent').textContent = summary;

    document.getElementById('summarySection').style.display = 'block';
  } catch (error) {
    console.error(error);

    alert('AI 요약 생성 중 오류 발생');
  } finally {
    summaryButton.disabled = false;
    summaryButton.textContent = '🤖 AI 요약';
  }
}
