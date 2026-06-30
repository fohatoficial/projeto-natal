import { createClient } from "@supabase/supabase-js";
const url = "https://brsplarbpylygnsakyjf.supabase.co";
const sb = createClient(url, process.env.PIPOCA_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false }});

const { data: films } = await sb.from("pipoca_films").select("id,slug,title,active").eq("active", true).order("display_order");
console.log("FILMS:", films?.length);
for (const f of films ?? []) {
  const { data: sps } = await sb.from("pipoca_scene_packs")
    .select("id,scene_name,active,status,reference_image_url,visual_style,color_mode,framing,pose_type,negative_prompt,prompt,created_at,updated_at")
    .eq("film_id", f.id);
  const activePacks = (sps ?? []).filter((s: any) => s.active && s.status === "active");
  console.log("\n===", f.slug, f.title, "id=", f.id);
  console.log("  total packs:", sps?.length, "active:", activePacks.length);
  for (const sp of sps ?? []) {
    console.log("  -", sp.id, "active="+sp.active, "status="+sp.status, "scene="+sp.scene_name, "updated="+sp.updated_at);
    if (sp.active && sp.status === "active") {
      let parsed: any = sp.prompt;
      if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch {} }
      const propRefs = parsed?.prop_references?.hat_reference_images ?? null;
      const promptLen = typeof sp.prompt === "string" ? sp.prompt.length : JSON.stringify(sp.prompt ?? "").length;
      console.log("    ref_image:", sp.reference_image_url ? new URL(sp.reference_image_url).pathname.split("/").pop() : "NULL");
      console.log("    visual_style:", sp.visual_style, "| color_mode:", sp.color_mode, "| framing:", sp.framing, "| pose:", sp.pose_type);
      console.log("    prompt_len:", promptLen, "| neg_prompt_len:", (sp.negative_prompt ?? "").length);
      console.log("    prop_refs:", propRefs);
    }
  }
}
