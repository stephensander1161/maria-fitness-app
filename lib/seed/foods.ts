/**
 * Food macro library, seeded as reference data like the exercise library.
 *
 * Everything is per 100g (per 100ml for drinks — near enough for anything
 * poured), because that is how labels are written and how a kitchen scale
 * works. The lookup scales from there using `unitGrams` when she types a
 * portion rather than a weight: "two slices of bread", "one egg".
 *
 * Rules the data keeps to:
 * • Cooked weights for anything weighed after cooking — meat, pasta, rice —
 *   because that is when it goes on the scale. The name always says which.
 * • Carbohydrate is available carbohydrate, the UK label convention: fibre is
 *   listed separately and is not counted twice. So 4×protein + 4×carbs +
 *   9×fat lands within about 10% of the stated calories on every row.
 *   The residue is fibre, which carries roughly 2 kcal/g and is not in that
 *   sum, and alcohol, which carries 7 and has no column of its own.
 * • Values follow standard reference tables (USDA, McCance & Widdowson) or,
 *   for shop-bought things those tables do not cover, the middle of the
 *   supermarket range. Nothing here is a guess — a food we could not pin
 *   down was left out so the coach estimates it instead of the table lying.
 * • `aliases` carry the other word for the same thing, in both dialects, so
 *   "aubergine" finds "eggplant" and "mince" finds "ground beef".
 */

export type FoodCategory =
  | "meat" | "fish" | "dairy" | "eggs" | "grain" | "legume" | "vegetable"
  | "fruit" | "nut" | "fat" | "sauce" | "drink" | "snack" | "prepared";

export type FoodSeed = {
  slug: string;
  name: string;
  category: FoodCategory;
  /** Per 100g, always. */
  kcal: number;
  proteinG: number;
  /** Available carbohydrate — fibre is not included here. */
  carbsG: number;
  fatG: number;
  /** Null where it is negligible or not meaningfully measured. */
  fibreG: number | null;
  /** Grams in one natural unit; null where there is no natural unit. */
  unitGrams: number | null;
  unitLabel: string | null;
  aliases: string[];
};

export const FOODS: FoodSeed[] = [
  // ── Meat and poultry ──────────────────────────────────────────────────────
  { slug: "chicken-breast-cooked", name: "Chicken breast, cooked", category: "meat", kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, fibreG: null, unitGrams: 120, unitLabel: "breast", aliases: ["chicken", "grilled chicken", "skinless chicken breast", "chicken fillet"] },
  { slug: "chicken-breast-raw", name: "Chicken breast, raw", category: "meat", kcal: 120, proteinG: 22.5, carbsG: 0, fatG: 2.6, fibreG: null, unitGrams: 160, unitLabel: "breast", aliases: ["raw chicken breast", "uncooked chicken"] },
  { slug: "chicken-thigh-cooked", name: "Chicken thigh, skinless, cooked", category: "meat", kcal: 209, proteinG: 26, carbsG: 0, fatG: 11, fibreG: null, unitGrams: 75, unitLabel: "thigh", aliases: ["chicken thighs", "boneless chicken thigh"] },
  { slug: "chicken-thigh-skin-on-roasted", name: "Chicken thigh, skin on, roasted", category: "meat", kcal: 229, proteinG: 25, carbsG: 0, fatG: 14.5, fibreG: null, unitGrams: 90, unitLabel: "thigh", aliases: ["roast chicken thigh"] },
  { slug: "chicken-drumstick-cooked", name: "Chicken drumstick, skinless, cooked", category: "meat", kcal: 175, proteinG: 28, carbsG: 0, fatG: 5.7, fibreG: null, unitGrams: 70, unitLabel: "drumstick", aliases: ["chicken leg"] },
  { slug: "chicken-wing-cooked", name: "Chicken wing, roasted", category: "meat", kcal: 290, proteinG: 27, carbsG: 0, fatG: 19.5, fibreG: null, unitGrams: 34, unitLabel: "wing", aliases: ["chicken wings"] },
  { slug: "rotisserie-chicken", name: "Rotisserie chicken, meat only", category: "meat", kcal: 190, proteinG: 29, carbsG: 0, fatG: 8, fibreG: null, unitGrams: 150, unitLabel: "portion", aliases: ["roast chicken", "shop-bought roast chicken", "cooked chicken", "supermarket chicken"] },
  { slug: "chicken-mince-cooked", name: "Chicken mince, cooked", category: "meat", kcal: 189, proteinG: 27, carbsG: 0, fatG: 8.5, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["ground chicken", "minced chicken"] },
  { slug: "turkey-breast-cooked", name: "Turkey breast, cooked", category: "meat", kcal: 135, proteinG: 30, carbsG: 0, fatG: 1, fibreG: null, unitGrams: 130, unitLabel: "portion", aliases: ["turkey", "roast turkey", "turkey steak"] },
  { slug: "turkey-mince-cooked", name: "Turkey mince, lean, cooked", category: "meat", kcal: 190, proteinG: 28, carbsG: 0, fatG: 8.5, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["ground turkey", "minced turkey"] },
  { slug: "turkey-rashers", name: "Turkey rashers, grilled", category: "meat", kcal: 120, proteinG: 17, carbsG: 2, fatG: 4.5, fibreG: null, unitGrams: 12, unitLabel: "rasher", aliases: ["turkey bacon", "turkey rasher"] },
  { slug: "beef-mince-5-cooked", name: "Beef mince, 5% fat, cooked", category: "meat", kcal: 174, proteinG: 26, carbsG: 0, fatG: 7.4, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["beef", "lean ground beef", "extra lean mince", "5% beef mince", "95% lean beef"] },
  { slug: "beef-mince-5-raw", name: "Beef mince, 5% fat, raw", category: "meat", kcal: 137, proteinG: 21.5, carbsG: 0, fatG: 5, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["raw lean mince", "raw ground beef"] },
  { slug: "beef-mince-20-cooked", name: "Beef mince, 20% fat, cooked", category: "meat", kcal: 254, proteinG: 26, carbsG: 0, fatG: 17, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["ground beef", "regular mince", "80/20 beef"] },
  { slug: "sirloin-steak-cooked", name: "Sirloin steak, grilled", category: "meat", kcal: 212, proteinG: 30, carbsG: 0, fatG: 10, fibreG: null, unitGrams: 160, unitLabel: "steak", aliases: ["steak", "beef steak", "minute steak", "strip steak"] },
  { slug: "ribeye-steak-cooked", name: "Ribeye steak, grilled", category: "meat", kcal: 291, proteinG: 25, carbsG: 0, fatG: 21, fibreG: null, unitGrams: 225, unitLabel: "steak", aliases: ["rib-eye", "scotch fillet"] },
  { slug: "fillet-steak-cooked", name: "Fillet steak, grilled", category: "meat", kcal: 218, proteinG: 30, carbsG: 0, fatG: 11, fibreG: null, unitGrams: 170, unitLabel: "steak", aliases: ["beef tenderloin", "filet mignon", "eye fillet"] },
  { slug: "braising-steak-cooked", name: "Braising steak, slow-cooked", category: "meat", kcal: 220, proteinG: 32, carbsG: 0, fatG: 10, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["stewing beef", "chuck steak", "casserole steak"] },
  { slug: "roast-beef-sliced", name: "Roast beef, lean, sliced", category: "meat", kcal: 136, proteinG: 22, carbsG: 1, fatG: 5, fibreG: null, unitGrams: 25, unitLabel: "slice", aliases: ["deli beef", "cold roast beef"] },
  { slug: "corned-beef", name: "Corned beef, tinned", category: "meat", kcal: 250, proteinG: 26, carbsG: 1, fatG: 16, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["bully beef", "canned corned beef"] },
  { slug: "pork-loin-chop-cooked", name: "Pork loin chop, grilled", category: "meat", kcal: 231, proteinG: 27, carbsG: 0, fatG: 13, fibreG: null, unitGrams: 120, unitLabel: "chop", aliases: ["pork chop"] },
  { slug: "pork-tenderloin-cooked", name: "Pork tenderloin, cooked", category: "meat", kcal: 143, proteinG: 26, carbsG: 0, fatG: 3.9, fibreG: null, unitGrams: 150, unitLabel: "portion", aliases: ["pork fillet", "pork loin fillet"] },
  { slug: "pork-mince-cooked", name: "Pork mince, cooked", category: "meat", kcal: 297, proteinG: 26, carbsG: 0, fatG: 21, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["ground pork", "minced pork"] },
  { slug: "bacon-back-grilled", name: "Back bacon, grilled", category: "meat", kcal: 214, proteinG: 25, carbsG: 0, fatG: 13, fibreG: null, unitGrams: 25, unitLabel: "rasher", aliases: ["bacon", "bacon rasher", "canadian bacon"] },
  { slug: "bacon-streaky-cooked", name: "Streaky bacon, cooked", category: "meat", kcal: 541, proteinG: 37, carbsG: 1.4, fatG: 42, fibreG: null, unitGrams: 12, unitLabel: "rasher", aliases: ["american bacon", "side bacon", "crispy bacon"] },
  { slug: "pork-sausage-cooked", name: "Pork sausage, grilled", category: "meat", kcal: 294, proteinG: 18, carbsG: 10, fatG: 20, fibreG: null, unitGrams: 57, unitLabel: "sausage", aliases: ["sausages", "banger"] },
  { slug: "ham-lean-sliced", name: "Ham, lean, sliced", category: "meat", kcal: 107, proteinG: 18, carbsG: 1.5, fatG: 3, fibreG: null, unitGrams: 25, unitLabel: "slice", aliases: ["deli ham", "cooked ham", "lean ham"] },
  { slug: "parma-ham", name: "Parma ham", category: "meat", kcal: 268, proteinG: 27, carbsG: 0, fatG: 17, fibreG: null, unitGrams: 15, unitLabel: "slice", aliases: ["prosciutto", "serrano ham", "cured ham"] },
  { slug: "chorizo", name: "Chorizo", category: "meat", kcal: 455, proteinG: 24, carbsG: 2, fatG: 38, fibreG: null, unitGrams: 30, unitLabel: "portion", aliases: ["spanish sausage"] },
  { slug: "salami", name: "Salami", category: "meat", kcal: 407, proteinG: 22, carbsG: 2, fatG: 33, fibreG: null, unitGrams: 10, unitLabel: "slice", aliases: ["milano salami"] },
  { slug: "pepperoni", name: "Pepperoni", category: "meat", kcal: 494, proteinG: 23, carbsG: 1, fatG: 44, fibreG: null, unitGrams: 5, unitLabel: "slice", aliases: [] },
  { slug: "hot-dog", name: "Hot dog sausage", category: "meat", kcal: 290, proteinG: 10, carbsG: 4, fatG: 26, fibreG: null, unitGrams: 45, unitLabel: "sausage", aliases: ["frankfurter", "wiener"] },
  { slug: "lamb-chop-cooked", name: "Lamb chop, grilled, lean", category: "meat", kcal: 235, proteinG: 30, carbsG: 0, fatG: 13, fibreG: null, unitGrams: 90, unitLabel: "chop", aliases: ["lamb cutlet", "lamb loin chop"] },
  { slug: "lamb-mince-cooked", name: "Lamb mince, cooked", category: "meat", kcal: 283, proteinG: 25, carbsG: 0, fatG: 20, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["ground lamb", "minced lamb"] },
  { slug: "lamb-leg-roast", name: "Roast leg of lamb, lean", category: "meat", kcal: 217, proteinG: 28, carbsG: 0, fatG: 11, fibreG: null, unitGrams: 90, unitLabel: "portion", aliases: ["roast lamb"] },
  { slug: "duck-breast-roasted", name: "Duck breast, skin off, roasted", category: "meat", kcal: 201, proteinG: 23.5, carbsG: 0, fatG: 11, fibreG: null, unitGrams: 140, unitLabel: "breast", aliases: ["duck"] },
  { slug: "venison-cooked", name: "Venison, cooked", category: "meat", kcal: 158, proteinG: 30, carbsG: 0, fatG: 3.2, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["deer meat"] },
  { slug: "beef-jerky", name: "Beef jerky", category: "meat", kcal: 410, proteinG: 33, carbsG: 11, fatG: 25.5, fibreG: null, unitGrams: 28, unitLabel: "bag", aliases: ["biltong", "dried beef"] },

  // ── Fish and seafood ──────────────────────────────────────────────────────
  { slug: "salmon-cooked", name: "Salmon fillet, cooked", category: "fish", kcal: 208, proteinG: 22.5, carbsG: 0, fatG: 12.4, fibreG: null, unitGrams: 130, unitLabel: "fillet", aliases: ["salmon", "baked salmon", "hot-smoked salmon", "grilled salmon"] },
  { slug: "salmon-raw", name: "Salmon fillet, raw", category: "fish", kcal: 183, proteinG: 20, carbsG: 0, fatG: 11, fibreG: null, unitGrams: 150, unitLabel: "fillet", aliases: ["raw salmon", "sashimi salmon"] },
  { slug: "smoked-salmon", name: "Smoked salmon", category: "fish", kcal: 142, proteinG: 25.4, carbsG: 0, fatG: 4.5, fibreG: null, unitGrams: 30, unitLabel: "slice", aliases: ["lox", "cold-smoked salmon"] },
  { slug: "salmon-tinned", name: "Salmon, tinned, drained", category: "fish", kcal: 139, proteinG: 20, carbsG: 0, fatG: 6, fibreG: null, unitGrams: 105, unitLabel: "tin (drained)", aliases: ["canned salmon", "pink salmon"] },
  { slug: "tuna-tinned-water", name: "Tuna, tinned in spring water, drained", category: "fish", kcal: 116, proteinG: 26, carbsG: 0, fatG: 1, fibreG: null, unitGrams: 112, unitLabel: "tin (drained)", aliases: ["tinned tuna", "canned tuna", "tuna in brine", "tuna"] },
  { slug: "tuna-tinned-oil", name: "Tuna, tinned in oil, drained", category: "fish", kcal: 198, proteinG: 29, carbsG: 0, fatG: 8.2, fibreG: null, unitGrams: 112, unitLabel: "tin (drained)", aliases: ["tuna in olive oil"] },
  { slug: "tuna-steak-cooked", name: "Tuna steak, cooked", category: "fish", kcal: 130, proteinG: 29, carbsG: 0, fatG: 1, fibreG: null, unitGrams: 150, unitLabel: "steak", aliases: ["fresh tuna", "yellowfin tuna", "seared tuna"] },
  { slug: "cod-cooked", name: "Cod fillet, cooked", category: "fish", kcal: 105, proteinG: 23, carbsG: 0, fatG: 0.9, fibreG: null, unitGrams: 150, unitLabel: "fillet", aliases: ["cod"] },
  { slug: "cod-raw", name: "Cod fillet, raw", category: "fish", kcal: 82, proteinG: 18, carbsG: 0, fatG: 0.7, fibreG: null, unitGrams: 180, unitLabel: "fillet", aliases: ["raw cod"] },
  { slug: "haddock-cooked", name: "Haddock fillet, cooked", category: "fish", kcal: 112, proteinG: 24, carbsG: 0, fatG: 0.9, fibreG: null, unitGrams: 150, unitLabel: "fillet", aliases: ["haddock"] },
  { slug: "white-fish-cooked", name: "White fish fillet, cooked", category: "fish", kcal: 100, proteinG: 22, carbsG: 0, fatG: 1, fibreG: null, unitGrams: 150, unitLabel: "fillet", aliases: ["white fish", "pollock", "hake", "basa", "coley", "whiting"] },
  { slug: "tilapia-cooked", name: "Tilapia, cooked", category: "fish", kcal: 128, proteinG: 26, carbsG: 0, fatG: 2.7, fibreG: null, unitGrams: 120, unitLabel: "fillet", aliases: [] },
  { slug: "sea-bass-cooked", name: "Sea bass, cooked", category: "fish", kcal: 124, proteinG: 24, carbsG: 0, fatG: 2.6, fibreG: null, unitGrams: 120, unitLabel: "fillet", aliases: ["seabass", "branzino"] },
  { slug: "trout-cooked", name: "Rainbow trout, cooked", category: "fish", kcal: 168, proteinG: 24, carbsG: 0, fatG: 7.2, fibreG: null, unitGrams: 130, unitLabel: "fillet", aliases: ["trout"] },
  { slug: "mackerel-cooked", name: "Mackerel, cooked", category: "fish", kcal: 262, proteinG: 24, carbsG: 0, fatG: 17.8, fibreG: null, unitGrams: 110, unitLabel: "fillet", aliases: ["mackerel"] },
  { slug: "smoked-mackerel", name: "Smoked mackerel", category: "fish", kcal: 354, proteinG: 19, carbsG: 0, fatG: 31, fibreG: null, unitGrams: 80, unitLabel: "fillet", aliases: ["peppered mackerel"] },
  { slug: "sardines-oil", name: "Sardines, tinned in oil, drained", category: "fish", kcal: 208, proteinG: 24.6, carbsG: 0, fatG: 11.5, fibreG: null, unitGrams: 90, unitLabel: "tin (drained)", aliases: ["sardines", "pilchards"] },
  { slug: "sardines-tomato", name: "Sardines, tinned in tomato sauce", category: "fish", kcal: 162, proteinG: 17, carbsG: 1.4, fatG: 9.9, fibreG: null, unitGrams: 120, unitLabel: "tin", aliases: [] },
  { slug: "anchovies-oil", name: "Anchovies, tinned in oil, drained", category: "fish", kcal: 210, proteinG: 29, carbsG: 0, fatG: 10, fibreG: null, unitGrams: 4, unitLabel: "fillet", aliases: ["anchovy"] },
  { slug: "prawns-cooked", name: "Prawns, cooked", category: "fish", kcal: 99, proteinG: 23, carbsG: 0, fatG: 0.8, fibreG: null, unitGrams: 10, unitLabel: "king prawn", aliases: ["shrimp", "prawn", "king prawns", "cooked shrimp"] },
  { slug: "prawns-raw", name: "Prawns, raw", category: "fish", kcal: 71, proteinG: 17, carbsG: 0, fatG: 0.5, fibreG: null, unitGrams: 12, unitLabel: "king prawn", aliases: ["raw shrimp", "raw prawns"] },
  { slug: "mussels-cooked", name: "Mussels, cooked", category: "fish", kcal: 172, proteinG: 24, carbsG: 7.4, fatG: 4.5, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["moules"] },
  { slug: "scallops-cooked", name: "Scallops, cooked", category: "fish", kcal: 111, proteinG: 20.5, carbsG: 5.4, fatG: 0.8, fibreG: null, unitGrams: 20, unitLabel: "scallop", aliases: [] },
  { slug: "crab-meat", name: "Crab meat, cooked", category: "fish", kcal: 97, proteinG: 19, carbsG: 0, fatG: 1.5, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["white crab meat"] },
  { slug: "squid-raw", name: "Squid, raw", category: "fish", kcal: 92, proteinG: 15.6, carbsG: 3, fatG: 1.4, fibreG: null, unitGrams: null, unitLabel: null, aliases: ["calamari"] },

  // ── Eggs ──────────────────────────────────────────────────────────────────
  { slug: "egg-raw", name: "Egg, raw", category: "eggs", kcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5, fibreG: null, unitGrams: 50, unitLabel: "egg", aliases: ["egg", "eggs", "hen egg", "large egg"] },
  { slug: "egg-boiled", name: "Egg, boiled", category: "eggs", kcal: 155, proteinG: 12.6, carbsG: 1.1, fatG: 10.6, fibreG: null, unitGrams: 50, unitLabel: "egg", aliases: ["boiled egg", "hard boiled egg", "soft boiled egg"] },
  { slug: "egg-poached", name: "Egg, poached", category: "eggs", kcal: 143, proteinG: 12.5, carbsG: 0.7, fatG: 9.5, fibreG: null, unitGrams: 50, unitLabel: "egg", aliases: ["poached egg"] },
  { slug: "egg-fried", name: "Egg, fried", category: "eggs", kcal: 196, proteinG: 13.6, carbsG: 0.8, fatG: 14.8, fibreG: null, unitGrams: 55, unitLabel: "egg", aliases: ["fried egg"] },
  { slug: "egg-scrambled", name: "Egg, scrambled with milk", category: "eggs", kcal: 149, proteinG: 10, carbsG: 1.6, fatG: 11, fibreG: null, unitGrams: 110, unitLabel: "2-egg serving", aliases: ["scrambled eggs", "omelette"] },
  { slug: "egg-white", name: "Egg white", category: "eggs", kcal: 52, proteinG: 11, carbsG: 0.7, fatG: 0.2, fibreG: null, unitGrams: 33, unitLabel: "white", aliases: ["egg whites", "liquid egg white", "egg white carton"] },
  { slug: "egg-yolk", name: "Egg yolk", category: "eggs", kcal: 322, proteinG: 16, carbsG: 3.6, fatG: 27, fibreG: null, unitGrams: 17, unitLabel: "yolk", aliases: ["yolk"] },
  { slug: "duck-egg", name: "Duck egg", category: "eggs", kcal: 185, proteinG: 13, carbsG: 1.4, fatG: 14, fibreG: null, unitGrams: 70, unitLabel: "egg", aliases: [] },

  // ── Dairy ─────────────────────────────────────────────────────────────────
  { slug: "milk-whole", name: "Whole milk", category: "dairy", kcal: 64, proteinG: 3.4, carbsG: 4.7, fatG: 3.6, fibreG: null, unitGrams: 250, unitLabel: "glass (250ml)", aliases: ["milk", "full fat milk", "whole fat milk"] },
  { slug: "milk-semi-skimmed", name: "Semi-skimmed milk", category: "dairy", kcal: 50, proteinG: 3.6, carbsG: 4.8, fatG: 1.8, fibreG: null, unitGrams: 250, unitLabel: "glass (250ml)", aliases: ["2% milk", "reduced fat milk", "milk"] },
  { slug: "milk-skimmed", name: "Skimmed milk", category: "dairy", kcal: 35, proteinG: 3.5, carbsG: 5, fatG: 0.2, fibreG: null, unitGrams: 250, unitLabel: "glass (250ml)", aliases: ["skim milk", "fat free milk", "nonfat milk"] },
  { slug: "oat-milk", name: "Oat milk", category: "dairy", kcal: 46, proteinG: 1, carbsG: 6.7, fatG: 1.5, fibreG: 0.8, unitGrams: 250, unitLabel: "glass (250ml)", aliases: ["oat drink", "oatly"] },
  { slug: "almond-milk-unsweetened", name: "Almond milk, unsweetened", category: "dairy", kcal: 13, proteinG: 0.5, carbsG: 0.3, fatG: 1.1, fibreG: null, unitGrams: 250, unitLabel: "glass (250ml)", aliases: ["almond drink", "unsweetened almond milk"] },
  { slug: "soya-milk-unsweetened", name: "Soya milk, unsweetened", category: "dairy", kcal: 33, proteinG: 3.3, carbsG: 0.6, fatG: 1.8, fibreG: 0.5, unitGrams: 250, unitLabel: "glass (250ml)", aliases: ["soy milk", "soya drink"] },
  { slug: "greek-yoghurt-0", name: "Greek yoghurt, 0% fat", category: "dairy", kcal: 57, proteinG: 10, carbsG: 4, fatG: 0.2, fibreG: null, unitGrams: 170, unitLabel: "pot", aliases: ["greek yogurt", "fat free greek yoghurt", "0% greek yoghurt", "greek yoghurt"] },
  { slug: "greek-yoghurt-5", name: "Greek yoghurt, 5% fat", category: "dairy", kcal: 97, proteinG: 9, carbsG: 3, fatG: 5, fibreG: null, unitGrams: 170, unitLabel: "pot", aliases: ["full fat greek yoghurt", "greek yogurt 5%"] },
  { slug: "skyr", name: "Skyr", category: "dairy", kcal: 63, proteinG: 11, carbsG: 4, fatG: 0.2, fibreG: null, unitGrams: 150, unitLabel: "pot", aliases: ["icelandic yoghurt", "icelandic style yogurt"] },
  { slug: "high-protein-yoghurt", name: "High-protein yoghurt", category: "dairy", kcal: 68, proteinG: 10, carbsG: 6, fatG: 0.2, fibreG: null, unitGrams: 200, unitLabel: "pot", aliases: ["protein yoghurt", "protein yogurt", "arla protein"] },
  { slug: "natural-yoghurt", name: "Natural yoghurt, whole milk", category: "dairy", kcal: 61, proteinG: 3.5, carbsG: 4.7, fatG: 3.3, fibreG: null, unitGrams: 150, unitLabel: "pot", aliases: ["plain yoghurt", "plain yogurt", "natural yogurt"] },
  { slug: "fruit-yoghurt-low-fat", name: "Fruit yoghurt, low fat", category: "dairy", kcal: 92, proteinG: 4, carbsG: 14, fatG: 2, fibreG: null, unitGrams: 125, unitLabel: "pot", aliases: ["flavoured yoghurt", "strawberry yoghurt"] },
  { slug: "quark", name: "Quark", category: "dairy", kcal: 71, proteinG: 12.5, carbsG: 4, fatG: 0.2, fibreG: null, unitGrams: 250, unitLabel: "tub", aliases: ["fat free quark"] },
  { slug: "cottage-cheese", name: "Cottage cheese", category: "dairy", kcal: 98, proteinG: 12, carbsG: 3.5, fatG: 4.3, fibreG: null, unitGrams: 150, unitLabel: "portion", aliases: ["curd cheese"] },
  { slug: "cottage-cheese-low-fat", name: "Cottage cheese, low fat", category: "dairy", kcal: 72, proteinG: 12.6, carbsG: 3.3, fatG: 1.5, fibreG: null, unitGrams: 150, unitLabel: "portion", aliases: ["reduced fat cottage cheese"] },
  { slug: "cheddar", name: "Cheddar", category: "dairy", kcal: 416, proteinG: 25, carbsG: 0.1, fatG: 35, fibreG: null, unitGrams: 30, unitLabel: "matchbox portion", aliases: ["cheese", "mature cheddar", "grated cheese"] },
  { slug: "cheddar-reduced-fat", name: "Cheddar, reduced fat", category: "dairy", kcal: 273, proteinG: 32, carbsG: 0.1, fatG: 16, fibreG: null, unitGrams: 30, unitLabel: "matchbox portion", aliases: ["light cheddar", "half fat cheddar"] },
  { slug: "mozzarella", name: "Mozzarella", category: "dairy", kcal: 300, proteinG: 22, carbsG: 2.2, fatG: 22, fibreG: null, unitGrams: 125, unitLabel: "ball", aliases: ["buffalo mozzarella"] },
  { slug: "mozzarella-light", name: "Mozzarella, light", category: "dairy", kcal: 224, proteinG: 27, carbsG: 1.5, fatG: 12.5, fibreG: null, unitGrams: 125, unitLabel: "ball", aliases: ["reduced fat mozzarella", "light mozzarella"] },
  { slug: "feta", name: "Feta", category: "dairy", kcal: 264, proteinG: 14.2, carbsG: 4.1, fatG: 21.3, fibreG: null, unitGrams: 30, unitLabel: "portion", aliases: ["greek cheese", "salad cheese"] },
  { slug: "parmesan", name: "Parmesan", category: "dairy", kcal: 392, proteinG: 36, carbsG: 3.2, fatG: 26, fibreG: null, unitGrams: 10, unitLabel: "tbsp grated", aliases: ["parmigiano", "grana padano", "pecorino"] },
  { slug: "halloumi", name: "Halloumi", category: "dairy", kcal: 321, proteinG: 22, carbsG: 2, fatG: 25, fibreG: null, unitGrams: 60, unitLabel: "portion", aliases: ["grilling cheese"] },
  { slug: "paneer", name: "Paneer", category: "dairy", kcal: 296, proteinG: 19, carbsG: 1.5, fatG: 23, fibreG: null, unitGrams: 120, unitLabel: "portion", aliases: ["indian cheese"] },
  { slug: "brie", name: "Brie", category: "dairy", kcal: 334, proteinG: 21, carbsG: 0.5, fatG: 28, fibreG: null, unitGrams: 30, unitLabel: "portion", aliases: ["camembert"] },
  { slug: "goats-cheese", name: "Goat's cheese, soft", category: "dairy", kcal: 268, proteinG: 18, carbsG: 2.5, fatG: 21, fibreG: null, unitGrams: 30, unitLabel: "portion", aliases: ["chevre", "goat cheese"] },
  { slug: "ricotta", name: "Ricotta", category: "dairy", kcal: 174, proteinG: 11, carbsG: 3, fatG: 13, fibreG: null, unitGrams: 60, unitLabel: "portion", aliases: [] },
  { slug: "cream-cheese", name: "Cream cheese, full fat", category: "dairy", kcal: 342, proteinG: 6, carbsG: 4, fatG: 34, fibreG: null, unitGrams: 30, unitLabel: "portion", aliases: ["philadelphia", "soft cheese"] },
  { slug: "cream-cheese-light", name: "Cream cheese, light", category: "dairy", kcal: 175, proteinG: 7.5, carbsG: 5, fatG: 13, fibreG: null, unitGrams: 30, unitLabel: "portion", aliases: ["light soft cheese", "reduced fat cream cheese"] },
  { slug: "cream-single", name: "Single cream", category: "dairy", kcal: 198, proteinG: 2.6, carbsG: 4, fatG: 19, fibreG: null, unitGrams: 30, unitLabel: "tbsp", aliases: ["light cream", "pouring cream"] },
  { slug: "cream-double", name: "Double cream", category: "dairy", kcal: 449, proteinG: 1.7, carbsG: 2.7, fatG: 48, fibreG: null, unitGrams: 30, unitLabel: "tbsp", aliases: ["heavy cream", "whipping cream"] },
  { slug: "soured-cream", name: "Soured cream", category: "dairy", kcal: 198, proteinG: 2.4, carbsG: 4.6, fatG: 19.4, fibreG: null, unitGrams: 30, unitLabel: "tbsp", aliases: ["sour cream"] },
  { slug: "creme-fraiche", name: "Crème fraîche, full fat", category: "dairy", kcal: 292, proteinG: 2.4, carbsG: 3, fatG: 30, fibreG: null, unitGrams: 30, unitLabel: "tbsp", aliases: ["creme fraiche"] },
  { slug: "ice-cream-vanilla", name: "Vanilla ice cream", category: "dairy", kcal: 207, proteinG: 3.5, carbsG: 24, fatG: 11, fibreG: null, unitGrams: 65, unitLabel: "scoop", aliases: ["ice cream"] },

  // ── Bread, grains, cereals and pasta ──────────────────────────────────────
  { slug: "bread-wholemeal", name: "Wholemeal bread", category: "grain", kcal: 227, proteinG: 10.5, carbsG: 38, fatG: 2.5, fibreG: 6.5, unitGrams: 40, unitLabel: "slice", aliases: ["bread", "brown bread", "whole wheat bread", "wholegrain bread"] },
  { slug: "bread-white", name: "White bread", category: "grain", kcal: 265, proteinG: 9, carbsG: 49, fatG: 3.2, fibreG: 2.7, unitGrams: 36, unitLabel: "slice", aliases: ["white sliced bread", "toast"] },
  { slug: "bread-sourdough", name: "Sourdough bread", category: "grain", kcal: 270, proteinG: 9.5, carbsG: 51, fatG: 1.5, fibreG: 2.4, unitGrams: 50, unitLabel: "slice", aliases: ["sourdough"] },
  { slug: "bread-rye", name: "Rye bread", category: "grain", kcal: 259, proteinG: 8.5, carbsG: 48, fatG: 3.3, fibreG: 5.8, unitGrams: 32, unitLabel: "slice", aliases: ["pumpernickel", "dark rye"] },
  { slug: "bagel", name: "Bagel, plain", category: "grain", kcal: 250, proteinG: 10, carbsG: 49, fatG: 1.5, fibreG: 2, unitGrams: 85, unitLabel: "bagel", aliases: ["bagel thin", "plain bagel"] },
  { slug: "pitta-wholemeal", name: "Wholemeal pitta bread", category: "grain", kcal: 265, proteinG: 9.5, carbsG: 50, fatG: 1.5, fibreG: 6.5, unitGrams: 60, unitLabel: "pitta", aliases: ["pitta", "pita bread", "wholemeal pita"] },
  { slug: "bread-roll", name: "Bread roll, crusty", category: "grain", kcal: 280, proteinG: 9.5, carbsG: 53, fatG: 2.5, fibreG: 2.5, unitGrams: 60, unitLabel: "roll", aliases: ["crusty roll", "baguette", "bap", "sub roll"] },
  { slug: "burger-bun-wholemeal", name: "Wholemeal burger bun", category: "grain", kcal: 270, proteinG: 9, carbsG: 48, fatG: 4, fibreG: 4, unitGrams: 60, unitLabel: "bun", aliases: ["burger bun", "wholemeal bun", "brioche bun"] },
  { slug: "tortilla-wrap-white", name: "Tortilla wrap, white", category: "grain", kcal: 300, proteinG: 8, carbsG: 50, fatG: 7, fibreG: 3, unitGrams: 62, unitLabel: "large wrap", aliases: ["wrap", "tortilla", "flour tortilla", "large tortilla wrap"] },
  { slug: "tortilla-wrap-wholemeal", name: "Tortilla wrap, wholemeal", category: "grain", kcal: 290, proteinG: 10, carbsG: 44, fatG: 7, fibreG: 7, unitGrams: 64, unitLabel: "large wrap", aliases: ["wholemeal wrap", "whole wheat tortilla"] },
  { slug: "tortilla-corn", name: "Corn tortilla", category: "grain", kcal: 218, proteinG: 5.7, carbsG: 40, fatG: 2.8, fibreG: 5, unitGrams: 26, unitLabel: "small tortilla", aliases: ["small tortilla", "soft taco"] },
  { slug: "naan", name: "Naan bread", category: "grain", kcal: 300, proteinG: 8.5, carbsG: 50, fatG: 7.5, fibreG: 2.5, unitGrams: 90, unitLabel: "naan", aliases: ["nan bread"] },
  { slug: "crumpet", name: "Crumpet", category: "grain", kcal: 180, proteinG: 6, carbsG: 36, fatG: 0.9, fibreG: 2, unitGrams: 55, unitLabel: "crumpet", aliases: [] },
  { slug: "english-muffin", name: "English muffin", category: "grain", kcal: 235, proteinG: 8, carbsG: 46, fatG: 1.8, fibreG: 2.5, unitGrams: 60, unitLabel: "muffin", aliases: ["breakfast muffin", "toasting muffin"] },
  { slug: "croissant", name: "Croissant", category: "grain", kcal: 406, proteinG: 8, carbsG: 46, fatG: 21, fibreG: 2.6, unitGrams: 60, unitLabel: "croissant", aliases: [] },
  { slug: "oats-dry", name: "Porridge oats, dry", category: "grain", kcal: 372, proteinG: 11, carbsG: 60, fatG: 8, fibreG: 9, unitGrams: 40, unitLabel: "serving", aliases: ["oats", "rolled oats", "oatmeal", "jumbo oats"] },
  { slug: "porridge-water", name: "Porridge, made with water", category: "grain", kcal: 71, proteinG: 2.5, carbsG: 12, fatG: 1.5, fibreG: 1.7, unitGrams: 250, unitLabel: "bowl", aliases: ["oatmeal cooked", "porridge"] },
  { slug: "granola", name: "Granola", category: "grain", kcal: 450, proteinG: 9, carbsG: 60, fatG: 18, fibreG: 6, unitGrams: 45, unitLabel: "serving", aliases: ["crunchy oat cereal"] },
  { slug: "muesli", name: "Muesli", category: "grain", kcal: 360, proteinG: 10, carbsG: 60, fatG: 8, fibreG: 7, unitGrams: 45, unitLabel: "serving", aliases: ["swiss muesli"] },
  { slug: "weetabix", name: "Wheat biscuit cereal", category: "grain", kcal: 362, proteinG: 12, carbsG: 69, fatG: 2, fibreG: 10, unitGrams: 19, unitLabel: "biscuit", aliases: ["weetabix", "wheat bisks"] },
  { slug: "cornflakes", name: "Cornflakes", category: "grain", kcal: 378, proteinG: 7, carbsG: 84, fatG: 0.9, fibreG: 3, unitGrams: 30, unitLabel: "bowl", aliases: ["corn flakes"] },
  { slug: "bran-flakes", name: "Bran flakes", category: "grain", kcal: 356, proteinG: 10, carbsG: 66, fatG: 2, fibreG: 15, unitGrams: 40, unitLabel: "bowl", aliases: ["all bran flakes"] },
  { slug: "rice-white-cooked", name: "White rice, cooked", category: "grain", kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3, fibreG: 0.4, unitGrams: 180, unitLabel: "portion", aliases: ["rice", "boiled rice", "basmati rice", "jasmine rice", "long grain rice"] },
  { slug: "rice-brown-cooked", name: "Brown rice, cooked", category: "grain", kcal: 123, proteinG: 2.7, carbsG: 25.6, fatG: 1, fibreG: 1.6, unitGrams: 180, unitLabel: "portion", aliases: ["wholegrain rice"] },
  { slug: "rice-pouch", name: "Microwave rice pouch", category: "grain", kcal: 154, proteinG: 3.2, carbsG: 30, fatG: 2, fibreG: 1.5, unitGrams: 250, unitLabel: "pouch", aliases: ["pouch rice", "microwave rice", "ready rice", "basmati pouch"] },
  { slug: "pasta-dried", name: "Pasta, dried", category: "grain", kcal: 371, proteinG: 13, carbsG: 75, fatG: 1.5, fibreG: 3, unitGrams: 75, unitLabel: "portion", aliases: ["dried pasta", "spaghetti", "penne", "fusilli", "linguine", "orzo", "macaroni"] },
  { slug: "pasta-cooked", name: "Pasta, cooked", category: "grain", kcal: 158, proteinG: 5.8, carbsG: 31, fatG: 0.9, fibreG: 1.8, unitGrams: 180, unitLabel: "portion", aliases: ["cooked pasta", "boiled spaghetti", "cooked spaghetti"] },
  { slug: "pasta-wholewheat-dried", name: "Wholewheat pasta, dried", category: "grain", kcal: 348, proteinG: 13.5, carbsG: 65, fatG: 2.5, fibreG: 9, unitGrams: 75, unitLabel: "portion", aliases: ["wholemeal pasta", "wholewheat spaghetti"] },
  { slug: "pasta-wholewheat-cooked", name: "Wholewheat pasta, cooked", category: "grain", kcal: 149, proteinG: 6, carbsG: 30, fatG: 1.3, fibreG: 4, unitGrams: 180, unitLabel: "portion", aliases: ["wholemeal pasta cooked"] },
  { slug: "fresh-filled-pasta", name: "Fresh filled pasta", category: "grain", kcal: 265, proteinG: 10, carbsG: 40, fatG: 7, fibreG: 2.5, unitGrams: 250, unitLabel: "pack", aliases: ["tortelloni", "tortellini", "ravioli", "spinach and ricotta tortelloni"] },
  { slug: "gnocchi", name: "Gnocchi", category: "grain", kcal: 160, proteinG: 4, carbsG: 33, fatG: 0.5, fibreG: 2, unitGrams: 250, unitLabel: "pack", aliases: ["potato gnocchi"] },
  { slug: "egg-noodles-dried", name: "Egg noodles, dried", category: "grain", kcal: 362, proteinG: 12, carbsG: 71, fatG: 3, fibreG: 3, unitGrams: 62, unitLabel: "nest", aliases: ["noodles", "medium egg noodles"] },
  { slug: "egg-noodles-cooked", name: "Egg noodles, cooked", category: "grain", kcal: 138, proteinG: 4.5, carbsG: 25, fatG: 2, fibreG: 1.2, unitGrams: 150, unitLabel: "portion", aliases: ["cooked noodles"] },
  { slug: "rice-noodles-dried", name: "Rice noodles, dried", category: "grain", kcal: 364, proteinG: 6, carbsG: 83, fatG: 0.6, fibreG: 1.6, unitGrams: 60, unitLabel: "nest", aliases: ["vermicelli noodles", "flat rice noodles"] },
  { slug: "rice-noodles-cooked", name: "Rice noodles, cooked", category: "grain", kcal: 109, proteinG: 0.9, carbsG: 25, fatG: 0.2, fibreG: 1, unitGrams: 150, unitLabel: "portion", aliases: ["cooked rice noodles"] },
  { slug: "couscous-dry", name: "Couscous, dry", category: "grain", kcal: 376, proteinG: 13, carbsG: 77, fatG: 0.6, fibreG: 5, unitGrams: 60, unitLabel: "portion", aliases: ["dry couscous"] },
  { slug: "couscous-cooked", name: "Couscous, cooked", category: "grain", kcal: 112, proteinG: 3.8, carbsG: 23, fatG: 0.2, fibreG: 1.4, unitGrams: 180, unitLabel: "portion", aliases: ["cooked couscous"] },
  { slug: "quinoa-dry", name: "Quinoa, dry", category: "grain", kcal: 368, proteinG: 14, carbsG: 64, fatG: 6, fibreG: 7, unitGrams: 60, unitLabel: "portion", aliases: ["dry quinoa"] },
  { slug: "quinoa-cooked", name: "Quinoa, cooked", category: "grain", kcal: 120, proteinG: 4.4, carbsG: 21, fatG: 1.9, fibreG: 2.8, unitGrams: 180, unitLabel: "portion", aliases: ["cooked quinoa"] },
  { slug: "bulgur-cooked", name: "Bulgur wheat, cooked", category: "grain", kcal: 83, proteinG: 3, carbsG: 15, fatG: 0.2, fibreG: 4.5, unitGrams: 180, unitLabel: "portion", aliases: ["bulghur", "cracked wheat"] },
  { slug: "pearl-barley-cooked", name: "Pearl barley, cooked", category: "grain", kcal: 123, proteinG: 2.3, carbsG: 28, fatG: 0.4, fibreG: 3.8, unitGrams: 180, unitLabel: "portion", aliases: ["barley"] },
  { slug: "rye-crispbread", name: "Rye crispbread", category: "grain", kcal: 334, proteinG: 9, carbsG: 63, fatG: 1.7, fibreG: 16, unitGrams: 10, unitLabel: "crispbread", aliases: ["ryvita", "rye cracker", "rye crackers", "crispbread"] },
  { slug: "oatcake", name: "Oatcake", category: "grain", kcal: 440, proteinG: 10, carbsG: 60, fatG: 18, fibreG: 6, unitGrams: 13, unitLabel: "oatcake", aliases: ["oat cakes"] },
  { slug: "croutons", name: "Croutons", category: "grain", kcal: 407, proteinG: 11, carbsG: 74, fatG: 6.6, fibreG: 5, unitGrams: 15, unitLabel: "small handful", aliases: [] },
  { slug: "flour-plain", name: "Plain flour", category: "grain", kcal: 341, proteinG: 9.4, carbsG: 71, fatG: 1.3, fibreG: 3, unitGrams: 15, unitLabel: "tbsp", aliases: ["all purpose flour", "white flour"] },
  { slug: "flour-wholemeal", name: "Wholemeal flour", category: "grain", kcal: 324, proteinG: 12.7, carbsG: 64, fatG: 2.2, fibreG: 9, unitGrams: 15, unitLabel: "tbsp", aliases: ["whole wheat flour"] },
  { slug: "cornflour", name: "Cornflour", category: "grain", kcal: 381, proteinG: 0.3, carbsG: 91, fatG: 0.1, fibreG: 0.9, unitGrams: 8, unitLabel: "tbsp", aliases: ["cornstarch"] },
  { slug: "breadcrumbs", name: "Breadcrumbs, dried", category: "grain", kcal: 395, proteinG: 13, carbsG: 72, fatG: 5, fibreG: 4.5, unitGrams: 15, unitLabel: "tbsp", aliases: ["panko"] },
