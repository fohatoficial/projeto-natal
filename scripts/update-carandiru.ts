import { createClient } from "@supabase/supabase-js";

const url = "https://brsplarbpylygnsakyjf.supabase.co";
const key = process.env.PIPOCA_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const SCENE_PACK_ID = "cdf055c4-843b-4209-82ca-d1e9fa83f2bd";

const newPrompt = {
  reference_roles: {
    image_1: "Primary face identity reference. Use ONLY this image as the source of facial identity. Preserve the visitor's exact face.",
    image_2: "Body, proportions and general appearance reference. Do NOT take facial features from this image.",
    image_3: "Scene/environment reference (Carandiru courtyard). Do NOT take facial features from this image."
  },
  scene: "Original cinematic scene inspired by Carandiru. Place the visitor naturally in the inner courtyard of a large Brazilian urban prison: weathered concrete, barred windows, worn architecture, documentary and human atmosphere.",
  subject: {
    count: "exactly one person",
    identity_priority: "maximum",
    pose: "natural standing posture in the courtyard",
    integration: "the visitor must feel physically present in the courtyard, with coherent scale, light and shadows; natural human proportions; the visitor's clothing must look authentic to a Brazilian prison environment from the Carandiru era"
  },
  wardrobe: {
    clothing: "simple Brazilian prison clothing from the Carandiru era: a worn sleeveless shirt or tank top, or a very simple sleeveless undershirt, paired with basic pants or shorts, with a realistic, humble, non-stylized appearance. Fabrics should look light, basic, lived-in and modest. The outfit must look natural and believable, matching a Brazilian prison environment, never fashion-oriented.",
    forbidden: "no police uniform, no military uniform, no caricatural inmate outfit, no costume, no American orange prison jumpsuit, no formal clothing, no fashion styling"
  },
  environment: {
    location: "inner courtyard of a large Brazilian urban prison",
    elements: "weathered concrete, barred windows, worn architecture",
    people: "no people in the background, no crowd, no figures at the windows, no armed guards",
    rule: "the visual center must be left clear for the visitor"
  },
  style: {
    medium: "cinematic photography",
    language: "social realism, documentary texture",
    atmosphere: "urban, dense and respectful — never horror or spectacle of violence; clothing must feel lived-in, humble and authentic to a Brazilian prison of the 1990s",
    wardrobe_note: "the outfit is everyday prison wear, not a costume; it should look real, modest and unstyled"
  },
  composition: {
    orientation: "vertical 4:5",
    framing: "medium or medium-wide shot",
    priority: "visitor clearly in the foreground, architecture visible, face well lit and legible; the full outfit should remain visible and coherent with the environment"
  },
  final_result: "A cinematic image coherent with Carandiru: exactly one person, preserved facial identity, natural integration, humble authentic clothing, no text and no logo."
};

const existingNegative = "multiple people, extra people, crowd, prisoners in the background, guards in the background, extra faces, duplicated person, duplicate body, extra limbs, extra arms, extra legs, deformed hands, distorted face, altered identity, police uniform, military uniform, exaggerated prison costume, orange jumpsuit, weapons, visible violence, blood, horror aesthetic, torture, text, logo, watermark, cartoon, childish illustration, fantasy, western clothing, cangaceiro hat, circus costume, monochrome Cinema Novo aesthetic, sertão landscape";

const additions = [
  "american prison uniform",
  "formal clothing",
  "suit",
  "fashion styling",
  "editorial styling",
  "costume",
  "glamorous clothing",
  "clean luxury outfit"
];

const newNegative = existingNegative + ", " + additions.join(", ");

async function main() {
  const { data: before, error: beforeErr } = await supabase
    .from("pipoca_scene_packs")
    .select("id, film_id, scene_name, prompt, negative_prompt")
    .eq("id", SCENE_PACK_ID)
    .single();
  console.log("Before prompt (first 200 chars):", JSON.stringify(before?.prompt).slice(0, 200));
  console.log("Before negative (first 200 chars):", (before?.negative_prompt ?? "").slice(0, 200));

  const { data, error } = await supabase
    .from("pipoca_scene_packs")
    .update({
      prompt: JSON.stringify(newPrompt),
      negative_prompt: newNegative
    })
    .eq("id", SCENE_PACK_ID)
    .select("id, prompt, negative_prompt");

  if (error) {
    console.error("Update error:", error);
    process.exit(1);
  }

  console.log("Updated scene pack ID:", data?.[0]?.id);
  console.log("New prompt (first 500 chars):", JSON.stringify(data?.[0]?.prompt).slice(0, 500));
  console.log("New negative prompt (first 500 chars):", (data?.[0]?.negative_prompt ?? "").slice(0, 500));
}

main().catch(console.error);
