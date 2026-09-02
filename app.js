document.addEventListener("DOMContentLoaded", async () => {
  // app.js 자체가 실행되는지 확인
  const testArea = document.createElement("div");

  testArea.style.marginTop = "20px";
  testArea.style.padding = "12px";
  testArea.style.background = "#ffffff";
  testArea.style.border = "1px solid #ddd";
  testArea.style.borderRadius = "8px";
  testArea.style.width = "fit-content";

  testArea.innerHTML = "① app.js 실행됨";

  document.getElementById("app").appendChild(testArea);

  try {

    // supabase.js에서 클라이언트가 만들어졌는지 확인
    if (typeof supabaseClient === "undefined") {
      testArea.innerHTML += "<br>❌ ② supabaseClient가 없음";
      return;
    }

    testArea.innerHTML += "<br>✅ ② supabaseClient 확인됨";


    // 실제 DB 연결 확인
    const { data, error } = await supabaseClient
      .from("site_settings")
      .select("*")
      .limit(1);

    if (error) {
      console.error(error);

      testArea.innerHTML +=
        "<br>❌ ③ DB 읽기 실패<br>" +
        "<small>" + error.message + "</small>";

      return;
    }

    testArea.innerHTML += "<br>✅ ③ Supabase 연결 성공!";

    console.log("Supabase data:", data);

  } catch (error) {

    console.error(error);

    testArea.innerHTML +=
      "<br>❌ 오류 발생<br>" +
      "<small>" + error.message + "</small>";
  }
});
