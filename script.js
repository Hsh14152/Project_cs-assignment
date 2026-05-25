// gemini-2.0-flash-lite: 무료 티어에서 사용 가능한 최신 모델
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

let uploadedFile = null;
let analysisResults = null;
let geminiApiKey = null;

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  loadApiKey();
  document
    .getElementById('fileInput')
    .addEventListener('change', handleFileSelect);
  document.getElementById('uploadBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('fileInput').click();
  });
  setupDragDrop();
});

function loadApiKey() {
  geminiApiKey = localStorage.getItem('gemini_api_key');
  if (geminiApiKey) {
    document.getElementById('apiKeyInput').value = geminiApiKey;
    document.getElementById('apiKeyStatus').textContent =
      '✓ API 키가 저장되어 있습니다';
    document.getElementById('apiKeyStatus').className =
      'api-key-status success';
    document.getElementById('uploadSection').style.display = 'block';
  }
}

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

  geminiApiKey = apiKey;
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
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  uploadedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadArea').style.display = 'block';
  document.getElementById('previewSection').style.display = 'none';
}

// 파일을 base64로 변환
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // data:image/png;base64,xxxx 에서 base64 부분만 추출
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function analyzeImage() {
  if (!uploadedFile) {
    alert('이미지를 먼저 업로드해주세요.');
    return;
  }

  if (!geminiApiKey) {
    alert('Gemini API 키를 먼저 설정해주세요.');
    return;
  }

  document.getElementById('previewSection').style.display = 'none';
  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('results').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
  document.getElementById('analyzeBtn').disabled = true;

  try {
    // 이미지를 base64로 변환
    updateProgress(20, '이미지를 준비하는 중...');
    const base64Image = await fileToBase64(uploadedFile);
    const mimeType = uploadedFile.type || 'image/png';

    // Gemini Vision으로 직접 분석
    updateProgress(50, 'Gemini Vision으로 이미지 분석 중...');
    const processes = await analyzeWithGeminiVision(base64Image, mimeType);

    updateProgress(100, '분석 완료!');

    if (!processes || processes.length === 0) {
      showError(
        '프로세스 정보를 찾을 수 없습니다.\n\n작업관리자의 프로세스/세부정보 탭이 잘 보이는 스크린샷으로 다시 시도해주세요.',
      );
      return;
    }

    analysisResults = processes;
    displayResults(analysisResults);
  } catch (error) {
    console.error('분석 에러:', error);
    showError('분석 중 오류가 발생했습니다.\n\n' + error.message);
  } finally {
    document.getElementById('analyzeBtn').disabled = false;
  }
}

async function analyzeWithGeminiVision(base64Image, mimeType) {
  const prompt = `이 이미지는 Windows 작업관리자 스크린샷입니다.

이미지에서 프로세스 목록을 분석하여 JSON 배열로만 반환해주세요.
각 프로세스는 다음 형식이어야 합니다:

{
  "name": "프로세스 이름 (깔끔하게 정리, 괄호 안 숫자 제거)",
  "memory": 메모리_MB_숫자값,
  "category": "safe/caution/critical 중 하나",
  "description": "한글로 상세한 설명 (종료 시 영향, 역할 등 포함)"
}

카테고리 기준:
- safe: 일반 응용 프로그램 (Chrome, Edge, VS Code, Discord, 카카오톡, 게임 등)
- caution: 시스템 서비스, 보안 프로그램 (Defender, 드라이버, AhnLab, antivirus 등)
- critical: 필수 시스템 프로세스 (System, explorer.exe, dwm.exe, svchost, csrss, winlogon 등)

규칙:
- 반드시 JSON 배열만 반환하고, 앞뒤에 다른 텍스트 없이 [ 로 시작해서 ] 로 끝내세요
- 마크다운 코드블록(\`\`\`) 사용 금지
- memory 값은 MB 단위 숫자만 (예: 1284.5), 텍스트 없이
- 이미지에서 읽을 수 없는 값은 0으로 처리`;

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

  const response = await fetch(`${GEMINI_API_URL}?key=${geminiApiKey}`, {
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

// 안전한 JSON 파싱 - 여러 방식으로 시도
function safeParseJSON(text) {
  let jsonText = text.trim();

  // 1. 마크다운 코드블록 제거
  jsonText = jsonText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  jsonText = jsonText.trim();

  // 2. JSON 배열 부분만 정규식으로 추출
  const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    jsonText = arrayMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonText);
    // 배열인지 확인
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // 객체 안에 배열이 있는 경우
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
      '⛔ 종료하면 안되는 시스템 프로세스',
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

function exportReport() {
  if (!analysisResults) return;

  const safeProcesses = analysisResults.filter((p) => p.category === 'safe');
  const safeMemory = safeProcesses.reduce((sum, p) => sum + (p.memory || 0), 0);

  let report = '프로세스 분석 보고서\n';
  report += '='.repeat(50) + '\n\n';
  report += `총 프로세스 수: ${analysisResults.length}개\n`;
  report += `안전하게 종료 가능: ${safeProcesses.length}개\n`;
  report += `확보 가능한 메모리: ${safeMemory.toFixed(1)} MB\n\n`;

  report += '안전하게 종료 가능한 프로세스:\n';
  report += '-'.repeat(50) + '\n';
  safeProcesses.forEach((p) => {
    report += `${p.name} - ${(p.memory || 0).toFixed(1)} MB\n`;
    report += `  ${p.description}\n\n`;
  });

  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'process_analysis_report.txt';
  a.click();
  URL.revokeObjectURL(url);
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
}
