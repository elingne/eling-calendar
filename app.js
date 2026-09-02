async function testSupabaseConnection() {
  const { data, error } = await supabaseClient
    .from("site_settings")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Supabase 연결 오류:", error);
    document.body.insertAdjacentHTML(
      "beforeend",
      "<p style='color:red;'>Supabase 연결 실패</p>"
    );
    return;
  }

  console.log("Supabase 연결 성공:", data);

  document.body.insertAdjacentHTML(
    "beforeend",
    "<p style='color:green;'>Supabase 연결 성공!</p>"
  );
}

testSupabaseConnection();
