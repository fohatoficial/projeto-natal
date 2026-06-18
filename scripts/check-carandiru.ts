import { createClient } from "@supabase/supabase-js";

const url = "https://brsplarbpylygnsakyjf.supabase.co";
const key = process.env.PIPOCA_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: filmData, error: filmErr } = await supabase
    .from("pipoca_films")
    .select("id, title, slug")
    .ilike("title", "%Carandiru%")
    .limit(5);
  console.log("Films:", JSON.stringify(filmData, null, 2));
  console.log("Film error:", filmErr);

  const { data: spData, error: spErr } = await supabase
    .from("pipoca_scene_packs")
    .select("*")
    .limit(10);
  console.log("Scene packs count:", spData?.length);
  console.log("Scene pack error:", spErr);

  if (filmData && filmData.length > 0) {
    const filmId = filmData[0].id;
    const { data: relatedSp, error: relatedErr } = await supabase
      .from("pipoca_scene_packs")
      .select("id, film_id, scene_name, prompt, negative_prompt, reference_image_url, active")
      .eq("film_id", filmId);
    console.log("Related scene packs:", JSON.stringify(relatedSp, null, 2));
    console.log("Related error:", relatedErr);
  }
}

main().catch(console.error);
