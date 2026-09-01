/**
 * Ready-made eating weeks, seeded as reference data. Onboarding picks the
 * closest match on diet, calorie level and how much cooking someone actually
 * wants to do, and instantiates it immediately.
 *
 * Rules the data keeps to:
 * • Every template has all 28 items — 7 days × breakfast/lunch/dinner/snack.
 * • Each day's calories sum to within 50 of `baseCalories`, and each day's
 *   protein reaches `baseProteinG`. Portions are scaled proportionally to the
 *   user's real target, so an error in the base is inherited by every user.
 * • Macros are internally consistent: 4×protein + 4×carbs + 9×fat lands within
 *   a rounding error of the stated calories.
 * • `contains` lists every notable ingredient across the week, lowercase, so a
 *   template can be skipped when someone dislikes something in it.
 * • The week varies. Nobody keeps cooking the same four dinners.
 */

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type MealTemplateItemSeed = {
  /** 0 = Monday … 6 = Sunday. */
  dayOfWeek: number;
  slot: MealSlot;
  title: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredients: string[];
  steps: string[];
  prepMinutes: number;
  sortOrder: number;
};

export type MealTemplateSeed = {
  slug: string;
  name: string;
  description: string;
  baseCalories: number;
  baseProteinG: number;
  dietaryTags: string[];
  cookingSkill: "minimal" | "comfortable" | "keen";
  contains: string[];
  meals: MealTemplateItemSeed[];
};

export const MEAL_TEMPLATES: MealTemplateSeed[] = [
  /* ── 1. Omnivore, 1500 kcal, minimal cooking ─────────────────────────────
   * Assembly rather than cooking: nothing takes more than about 15 minutes
   * and most of the week is shop-bought components put together.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "quick-omnivore-1500",
    name: "Quick Omnivore — 1500",
    description: "A week of meals that are mostly assembled rather than cooked, for when the food needs to be sorted in fifteen minutes or it doesn't happen.",
    baseCalories: 1500,
    baseProteinG: 120,
    dietaryTags: [],
    cookingSkill: "minimal",
    contains: [
      "greek yoghurt", "berries", "granola", "chicken", "hummus", "tortilla wrap",
      "salmon", "new potatoes", "green beans", "cottage cheese", "apple", "almonds",
      "eggs", "bread", "tomatoes", "tuna", "butter beans", "rice", "protein powder",
      "banana", "oats", "blueberries", "ham", "cheese", "prawns", "pasta", "walnuts",
      "rye bread", "smoked salmon", "cream cheese", "bagel", "beef mince",
      "kidney beans", "skyr", "dark chocolate", "peanut butter", "avocado",
      "satsuma", "quinoa", "white fish", "coleslaw", "nectarine", "baked beans",
      "couscous", "steak", "sweet potato", "broccoli", "pineapple", "pecans",
      "olive oil", "tzatziki", "pitta bread", "mayonnaise", "salad leaves",
      "cucumber", "peppers", "onion", "lemon", "honey", "sourdough",
    ],
    meals: [
      // ── Monday ──
      { dayOfWeek: 0, slot: "breakfast", sortOrder: 0, title: "Greek yoghurt with berries and granola",
        calories: 334, proteinG: 30, carbsG: 40, fatG: 6, prepMinutes: 3,
        ingredients: ["250g 0% Greek yoghurt", "100g mixed berries", "30g granola"],
        steps: ["Spoon the yoghurt into a bowl.", "Top with the berries and granola.", "If you're taking it out, layer it in a jar the night before."] },
      { dayOfWeek: 0, slot: "lunch", sortOrder: 1, title: "Chicken and hummus wrap",
        calories: 429, proteinG: 38, carbsG: 40, fatG: 13, prepMinutes: 6,
        ingredients: ["1 large tortilla wrap", "140g cooked chicken breast", "40g hummus", "handful of salad leaves", "1/2 red pepper, sliced"],
        steps: ["Spread the hummus over the wrap.", "Lay on the chicken, leaves and pepper.", "Roll tightly, tuck the ends in, cut in half."] },
      { dayOfWeek: 0, slot: "dinner", sortOrder: 2, title: "Salmon traybake with new potatoes and green beans",
        calories: 481, proteinG: 36, carbsG: 46, fatG: 17, prepMinutes: 10,
        ingredients: ["1 salmon fillet (130g)", "250g new potatoes, halved", "150g green beans", "1 tsp olive oil", "1/2 lemon"],
        steps: ["Oven 200C. Potatoes on a tray with the oil, 20 minutes.", "Add the salmon and beans, 12 minutes more.", "Squeeze the lemon over everything before serving."] },
      { dayOfWeek: 0, slot: "snack", sortOrder: 3, title: "Cottage cheese with apple and almonds",
        calories: 240, proteinG: 16, carbsG: 26, fatG: 8, prepMinutes: 2,
        ingredients: ["120g cottage cheese", "1 apple", "10g almonds"],
        steps: ["Slice the apple.", "Cottage cheese in a bowl, apple and almonds on top."] },

      // ── Tuesday ──
      { dayOfWeek: 1, slot: "breakfast", sortOrder: 0, title: "Scrambled eggs on toast with tomatoes",
        calories: 350, proteinG: 26, carbsG: 30, fatG: 14, prepMinutes: 8,
        ingredients: ["3 eggs", "1 slice wholemeal bread", "handful cherry tomatoes", "splash of milk"],
        steps: ["Beat the eggs with the milk and a pinch of salt.", "Low heat, stir slowly, take them off while still slightly wet.", "Serve on the toast with the tomatoes alongside."] },
      { dayOfWeek: 1, slot: "lunch", sortOrder: 1, title: "Tuna and butter bean salad",
        calories: 418, proteinG: 35, carbsG: 38, fatG: 14, prepMinutes: 6,
        ingredients: ["1 tin tuna in spring water, drained", "200g tinned butter beans, rinsed", "1/2 red onion", "cucumber", "1 tsp olive oil", "lemon juice"],
        steps: ["Rinse the beans well and tip into a bowl.", "Flake in the tuna, add the chopped onion and cucumber.", "Dress with the oil and a good squeeze of lemon."] },
      { dayOfWeek: 1, slot: "dinner", sortOrder: 2, title: "Chicken stir-fry with rice",
        calories: 491, proteinG: 40, carbsG: 58, fatG: 11, prepMinutes: 15,
        ingredients: ["150g chicken breast, sliced", "1 pack stir-fry vegetables", "1 pouch microwave rice", "1 tsp olive oil", "soy sauce"],
        steps: ["Hot pan, oil, chicken — 5 minutes until coloured through.", "Add the vegetables and a splash of soy, 4 minutes more.", "Microwave the rice and stir it through."] },
      { dayOfWeek: 1, slot: "snack", sortOrder: 3, title: "Protein shake with a banana",
        calories: 239, proteinG: 25, carbsG: 28, fatG: 3, prepMinutes: 2,
        ingredients: ["1 scoop protein powder", "1 banana", "250ml water or skimmed milk"],
        steps: ["Blend, or shake the powder and eat the banana alongside.", "Good one for straight after training."] },

      // ── Wednesday ──
      { dayOfWeek: 2, slot: "breakfast", sortOrder: 0, title: "Overnight oats with protein powder and blueberries",
        calories: 351, proteinG: 30, carbsG: 42, fatG: 7, prepMinutes: 5,
        ingredients: ["50g porridge oats", "1 scoop vanilla protein powder", "150ml skimmed milk", "80g blueberries"],
        steps: ["Stir the oats, powder and milk together in a jar.", "Lid on, fridge overnight.", "Top with the blueberries in the morning."] },
      { dayOfWeek: 2, slot: "lunch", sortOrder: 1, title: "Ham, cheese and salad sandwich",
        calories: 424, proteinG: 35, carbsG: 44, fatG: 12, prepMinutes: 5,
        ingredients: ["2 slices wholemeal bread", "100g lean ham", "20g cheddar", "salad leaves", "tomato", "1 tsp mayonnaise"],
        steps: ["Thin scrape of mayonnaise on one slice.", "Build with the ham, cheese, leaves and tomato.", "Press, cut, done."] },
      { dayOfWeek: 2, slot: "dinner", sortOrder: 2, title: "Prawn and tomato pasta",
        calories: 470, proteinG: 35, carbsG: 60, fatG: 10, prepMinutes: 15,
        ingredients: ["75g dried pasta", "180g cooked prawns", "1/2 jar tomato pasta sauce", "1 tsp olive oil", "garlic"],
        steps: ["Boil the pasta.", "Warm the sauce with the garlic and oil, add the prawns for the last 2 minutes.", "Drain the pasta, stir it through the sauce."] },
      { dayOfWeek: 2, slot: "snack", sortOrder: 3, title: "Cottage cheese on rye with tomato",
        calories: 230, proteinG: 20, carbsG: 24, fatG: 6, prepMinutes: 3,
        ingredients: ["2 rye crispbreads", "150g cottage cheese", "1 tomato", "black pepper"],
        steps: ["Spread the cottage cheese over the crispbreads.", "Sliced tomato on top, plenty of pepper."] },

      // ── Thursday ──
      { dayOfWeek: 3, slot: "breakfast", sortOrder: 0, title: "Smoked salmon and cream cheese bagel",
        calories: 338, proteinG: 28, carbsG: 34, fatG: 10, prepMinutes: 4,
        ingredients: ["1 bagel thin", "80g smoked salmon", "30g light cream cheese", "lemon", "black pepper"],
        steps: ["Toast the bagel thin.", "Cream cheese, then the salmon.", "Squeeze of lemon and a lot of black pepper."] },
      { dayOfWeek: 3, slot: "lunch", sortOrder: 1, title: "Chicken caesar-style salad bowl",
        calories: 418, proteinG: 38, carbsG: 26, fatG: 18, prepMinutes: 7,
        ingredients: ["150g shop-bought roast chicken", "1 romaine heart", "20g parmesan", "1 tbsp light caesar dressing", "small handful croutons"],
        steps: ["Shred the lettuce into a bowl.", "Pull the chicken over it, add the croutons and parmesan.", "Dressing last, toss just before eating."] },
      { dayOfWeek: 3, slot: "dinner", sortOrder: 2, title: "Beef chilli with rice",
        calories: 465, proteinG: 35, carbsG: 52, fatG: 13, prepMinutes: 15,
        ingredients: ["150g 5% beef mince", "200g tinned kidney beans", "1 tin chopped tomatoes", "1/2 onion", "chilli powder and cumin", "1 pouch microwave rice"],
        steps: ["Brown the mince with the onion.", "Add the spices, tomatoes and drained beans; simmer 10 minutes.", "Serve over the rice. Make double and Friday's lunch is done."] },
      { dayOfWeek: 3, slot: "snack", sortOrder: 3, title: "Skyr with berries and dark chocolate",
        calories: 263, proteinG: 20, carbsG: 30, fatG: 7, prepMinutes: 2,
        ingredients: ["170g skyr", "80g raspberries", "10g dark chocolate"],
        steps: ["Skyr in a bowl, berries on top.", "Chop the chocolate over it."] },

      // ── Friday ──
      { dayOfWeek: 4, slot: "breakfast", sortOrder: 0, title: "Banana and peanut butter protein smoothie",
        calories: 362, proteinG: 30, carbsG: 38, fatG: 10, prepMinutes: 3,
        ingredients: ["1 scoop protein powder", "1 banana", "15g peanut butter", "250ml skimmed milk", "ice"],
        steps: ["Everything in the blender, 30 seconds.", "Add more milk if it's too thick to drink."] },
      { dayOfWeek: 4, slot: "lunch", sortOrder: 1, title: "Jacket potato with tuna mayo",
        calories: 418, proteinG: 32, carbsG: 50, fatG: 10, prepMinutes: 12,
        ingredients: ["1 medium baking potato", "1 tin tuna, drained", "1 tbsp light mayonnaise", "sweetcorn", "side salad"],
        steps: ["Microwave the potato 8 minutes, then 5 in a hot oven if you want crisp skin.", "Mix the tuna with the mayonnaise and sweetcorn.", "Split the potato, pile it in, salad alongside."] },
      { dayOfWeek: 4, slot: "dinner", sortOrder: 2, title: "Chicken souvlaki pitta with tzatziki",
        calories: 460, proteinG: 40, carbsG: 48, fatG: 12, prepMinutes: 15,
        ingredients: ["160g chicken breast, cubed", "1 wholemeal pitta", "50g tzatziki", "tomato, onion, lettuce", "1 tsp olive oil", "oregano and lemon"],
        steps: ["Toss the chicken with the oil, oregano and lemon.", "Hot pan, 8 minutes, turning until browned all over.", "Warm the pitta, fill with chicken, salad and tzatziki."] },
      { dayOfWeek: 4, slot: "snack", sortOrder: 3, title: "Cottage cheese with satsumas and almonds",
        calories: 233, proteinG: 18, carbsG: 20, fatG: 9, prepMinutes: 2,
        ingredients: ["140g cottage cheese", "2 satsumas", "12g almonds"],
        steps: ["Cottage cheese in a bowl.", "Satsuma segments and almonds on top."] },

      // ── Saturday ──
      { dayOfWeek: 5, slot: "breakfast", sortOrder: 0, title: "Poached eggs with avocado on sourdough",
        calories: 376, proteinG: 24, carbsG: 34, fatG: 16, prepMinutes: 10,
        ingredients: ["2 eggs", "1 slice sourdough", "1/2 avocado", "chilli flakes", "lemon"],
        steps: ["Poach the eggs in barely simmering water, 3 minutes.", "Smash the avocado onto the toast with lemon and salt.", "Eggs on top, chilli flakes over."] },
      { dayOfWeek: 5, slot: "lunch", sortOrder: 1, title: "Chicken and quinoa salad box",
        calories: 432, proteinG: 35, carbsG: 46, fatG: 12, prepMinutes: 6,
        ingredients: ["140g cooked chicken", "150g cooked quinoa", "roasted peppers", "cucumber", "1 tsp olive oil", "lemon juice"],
        steps: ["Fork the quinoa into a box.", "Layer the chicken and vegetables on top.", "Dress with oil and lemon when you eat it, not before."] },
      { dayOfWeek: 5, slot: "dinner", sortOrder: 2, title: "Fish tacos with slaw",
        calories: 452, proteinG: 38, carbsG: 48, fatG: 12, prepMinutes: 15,
        ingredients: ["180g white fish fillet", "3 small tortillas", "100g coleslaw mix", "lime", "paprika", "1 tsp olive oil"],
        steps: ["Rub the fish with paprika and oil, pan-fry 3 minutes a side.", "Dress the slaw with lime juice.", "Flake the fish into the warmed tortillas, slaw on top."] },
      { dayOfWeek: 5, slot: "snack", sortOrder: 3, title: "Protein yoghurt with a nectarine",
        calories: 227, proteinG: 24, carbsG: 26, fatG: 3, prepMinutes: 2,
        ingredients: ["200g high-protein yoghurt", "1 nectarine"],
        steps: ["Slice the nectarine over the yoghurt.", "Takes two minutes and covers most of a day's shortfall in protein."] },

      // ── Sunday ──
      { dayOfWeek: 6, slot: "breakfast", sortOrder: 0, title: "Baked beans on toast with a poached egg",
        calories: 376, proteinG: 24, carbsG: 52, fatG: 8, prepMinutes: 8,
        ingredients: ["200g baked beans", "1 slice wholemeal bread", "1 egg"],
        steps: ["Beans in a pan on a low heat.", "Poach the egg while the toast is on.", "Beans on the toast, egg on top."] },
      { dayOfWeek: 6, slot: "lunch", sortOrder: 1, title: "Roast chicken with couscous and vegetables",
        calories: 428, proteinG: 38, carbsG: 42, fatG: 12, prepMinutes: 10,
        ingredients: ["150g shop-bought roast chicken", "60g dry couscous", "roasted peppers and courgette", "1 tsp olive oil", "lemon"],
        steps: ["Pour boiling water over the couscous, cover for 5 minutes.", "Fork through with the oil and lemon.", "Chicken and vegetables on top."] },
      { dayOfWeek: 6, slot: "dinner", sortOrder: 2, title: "Steak with sweet potato wedges and broccoli",
        calories: 464, proteinG: 40, carbsG: 40, fatG: 16, prepMinutes: 15,
        ingredients: ["150g sirloin steak", "200g sweet potato", "150g broccoli", "1 tsp olive oil"],
        steps: ["Wedges in a 200C oven with the oil, 25 minutes.", "Steak in a very hot pan, 3 minutes a side for medium, then rest 5 minutes.", "Steam the broccoli while the steak rests."] },
      { dayOfWeek: 6, slot: "snack", sortOrder: 3, title: "Cottage cheese with pineapple and pecans",
        calories: 242, proteinG: 18, carbsG: 20, fatG: 10, prepMinutes: 2,
        ingredients: ["140g cottage cheese", "100g pineapple", "12g pecans"],
        steps: ["Cottage cheese in a bowl, pineapple on top.", "Roughly break the pecans over it."] },
    ],
  },

  /* ── 2. Omnivore, 1800 kcal, comfortable cooking ─────────────────────────
   * For someone who is happy in a kitchen on a weeknight. Dinners are proper
   * cooking; breakfasts and snacks stay quick because mornings never change.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "home-cooked-omnivore-1800",
    name: "Home Cooked Omnivore — 1800",
    description: "A week of proper cooked dinners at a higher calorie level, for someone who enjoys the cooking and has half an hour for it most evenings.",
    baseCalories: 1800,
    baseProteinG: 130,
    dietaryTags: [],
    cookingSkill: "comfortable",
    contains: [
      "eggs", "sourdough", "peppers", "onion", "chopped tomatoes", "chicken",
      "feta", "couscous", "beef mince", "black beans", "rice", "soured cream",
      "skyr", "berries", "honey", "almonds", "protein powder", "banana",
      "greek yoghurt", "salmon", "avocado", "soy sauce", "chickpeas", "harissa",
      "cottage cheese", "pear", "walnuts", "mushrooms", "spinach", "bread",
      "turkey", "hummus", "coleslaw", "prawns", "linguine", "garlic", "chilli",
      "lemon", "granola", "oats", "peanut butter", "lentils", "chorizo",
      "bread roll", "cod", "potatoes", "peas", "butter", "dark chocolate",
      "raspberries", "smoked salmon", "rye bread", "parmesan", "croutons",
      "beef", "burger bun", "sweet potato", "steak", "rocket", "coconut milk",
      "green curry paste", "apple", "cinnamon", "bacon", "carrots", "pesto",
      "orzo", "courgette", "pistachios", "olive oil",
    ],
    meals: [
      // ── Monday ──
      { dayOfWeek: 0, slot: "breakfast", sortOrder: 0, title: "Shakshuka with sourdough",
        calories: 442, proteinG: 26, carbsG: 44, fatG: 18, prepMinutes: 15,
        ingredients: ["2 eggs", "1 tin chopped tomatoes", "1 red pepper", "1/2 onion", "cumin and paprika", "1 slice sourdough", "1 tsp olive oil"],
        steps: ["Soften the onion and pepper in the oil, 6 minutes.", "Add the spices and tomatoes, simmer until thick.", "Make two wells, crack in the eggs, lid on for 5 minutes.", "Serve with the sourdough for mopping."] },
      { dayOfWeek: 0, slot: "lunch", sortOrder: 1, title: "Chicken, feta and couscous salad",
        calories: 472, proteinG: 38, carbsG: 44, fatG: 16, prepMinutes: 12,
        ingredients: ["140g chicken breast", "60g dry couscous", "30g feta", "cucumber", "cherry tomatoes", "1 tsp olive oil", "lemon"],
        steps: ["Cover the couscous with boiling water, 5 minutes, then fork through.", "Griddle the chicken 5 minutes a side and slice.", "Toss everything with the oil, lemon and crumbled feta."] },
      { dayOfWeek: 0, slot: "dinner", sortOrder: 2, title: "Beef and black bean chilli",
        calories: 590, proteinG: 45, carbsG: 62, fatG: 18, prepMinutes: 30,
        ingredients: ["180g 5% beef mince", "200g tinned black beans", "1 tin chopped tomatoes", "1 onion", "chilli, cumin, smoked paprika", "1 pouch rice", "1 tbsp soured cream"],
        steps: ["Brown the mince hard, then set aside and soften the onion.", "Spices in for a minute, then tomatoes, beans and the mince back.", "Simmer 20 minutes — this is where the flavour comes from.", "Serve over rice with the soured cream."] },
      { dayOfWeek: 0, slot: "snack", sortOrder: 3, title: "Skyr with berries, honey and almonds",
        calories: 306, proteinG: 24, carbsG: 30, fatG: 10, prepMinutes: 2,
        ingredients: ["200g skyr", "100g mixed berries", "1 tsp honey", "12g almonds"],
        steps: ["Skyr in a bowl.", "Berries and almonds on top, honey over."] },

      // ── Tuesday ──
      { dayOfWeek: 1, slot: "breakfast", sortOrder: 0, title: "Protein pancakes with banana and yoghurt",
        calories: 418, proteinG: 32, carbsG: 50, fatG: 10, prepMinutes: 12,
        ingredients: ["40g oats", "1 scoop protein powder", "1 egg", "1 banana", "100g Greek yoghurt", "1 tsp oil"],
        steps: ["Blend the oats, powder, egg and half the banana.", "Small pancakes in a lightly oiled pan, 90 seconds a side.", "Stack with the yoghurt and the rest of the banana sliced over."] },
      { dayOfWeek: 1, slot: "lunch", sortOrder: 1, title: "Salmon and avocado rice bowl",
        calories: 498, proteinG: 34, carbsG: 50, fatG: 18, prepMinutes: 12,
        ingredients: ["120g hot-smoked or cooked salmon", "180g cooked rice", "1/2 avocado", "cucumber", "soy sauce", "sesame seeds"],
        steps: ["Rice into the bowl, warm or cold both work.", "Flake the salmon over, add the sliced avocado and cucumber.", "Soy sauce and sesame seeds to finish."] },
      { dayOfWeek: 1, slot: "dinner", sortOrder: 2, title: "Harissa chicken traybake with chickpeas",
        calories: 600, proteinG: 45, carbsG: 60, fatG: 20, prepMinutes: 35,
        ingredients: ["2 chicken thighs, skin off", "1 tin chickpeas", "2 peppers", "1 red onion", "1 tbsp harissa", "1 tsp olive oil", "lemon"],
        steps: ["Oven 200C. Toss everything with the harissa and oil on one tray.", "Roast 30 minutes, turning once halfway.", "Squeeze the lemon over the whole tray before serving."] },
      { dayOfWeek: 1, slot: "snack", sortOrder: 3, title: "Cottage cheese with pear and walnuts",
        calories: 266, proteinG: 20, carbsG: 24, fatG: 10, prepMinutes: 3,
        ingredients: ["150g cottage cheese", "1 pear", "12g walnuts"],
        steps: ["Slice the pear.", "Cottage cheese in a bowl, pear and broken walnuts on top."] },

      // ── Wednesday ──
      { dayOfWeek: 2, slot: "breakfast", sortOrder: 0, title: "Mushroom and spinach omelette with toast",
        calories: 402, proteinG: 28, carbsG: 32, fatG: 18, prepMinutes: 12,
        ingredients: ["3 eggs", "80g mushrooms", "large handful spinach", "1 slice wholemeal bread", "1 tsp olive oil"],
        steps: ["Fry the mushrooms hard until they colour, then wilt the spinach in.", "Pour the beaten eggs over, low heat, lift the edges as it sets.", "Fold, slide onto the plate, toast alongside."] },
      { dayOfWeek: 2, slot: "lunch", sortOrder: 1, title: "Turkey and hummus wrap with slaw",
        calories: 462, proteinG: 36, carbsG: 48, fatG: 14, prepMinutes: 8,
        ingredients: ["1 large wholemeal wrap", "130g turkey breast", "40g hummus", "80g coleslaw mix", "lemon juice"],
        steps: ["Dress the slaw with lemon juice.", "Hummus over the wrap, then turkey and slaw.", "Roll tight and cut on the diagonal."] },
      { dayOfWeek: 2, slot: "dinner", sortOrder: 2, title: "Prawn linguine with garlic, chilli and lemon",
        calories: 600, proteinG: 42, carbsG: 72, fatG: 16, prepMinutes: 20,
        ingredients: ["100g dried linguine", "200g raw prawns", "3 cloves garlic", "1 red chilli", "1 tbsp olive oil", "lemon", "parsley"],
        steps: ["Linguine on. Keep a mugful of the cooking water.", "Gently warm the garlic and chilli in the oil — don't let the garlic brown.", "Prawns in for 3 minutes until just pink.", "Pasta into the pan with a splash of the water, toss hard, lemon and parsley."] },
      { dayOfWeek: 2, slot: "snack", sortOrder: 3, title: "Greek yoghurt with granola",
        calories: 304, proteinG: 24, carbsG: 34, fatG: 8, prepMinutes: 2,
        ingredients: ["200g 0% Greek yoghurt", "35g granola"],
        steps: ["Yoghurt in a bowl.", "Granola over the top, added just before eating so it stays crunchy."] },

      // ── Thursday ──
      { dayOfWeek: 3, slot: "breakfast", sortOrder: 0, title: "Overnight oats with peanut butter and banana",
        calories: 462, proteinG: 28, carbsG: 56, fatG: 14, prepMinutes: 5,
        ingredients: ["60g oats", "1 scoop protein powder", "200ml milk", "15g peanut butter", "1 banana"],
        steps: ["Stir the oats, powder and milk in a jar, fridge overnight.", "In the morning swirl through the peanut butter.", "Slice the banana over."] },
      { dayOfWeek: 3, slot: "lunch", sortOrder: 1, title: "Lentil and chorizo soup with a roll",
        calories: 494, proteinG: 34, carbsG: 58, fatG: 14, prepMinutes: 25,
        ingredients: ["150g cooked green lentils", "40g chorizo", "1 onion", "1 carrot", "500ml chicken stock", "1 crusty bread roll"],
        steps: ["Render the diced chorizo in a dry pan, then soften the onion and carrot in its oil.", "Lentils and stock in, simmer 15 minutes.", "Blend half of it for body, leave the rest chunky. Roll on the side."] },
      { dayOfWeek: 3, slot: "dinner", sortOrder: 2, title: "Roast cod with crushed potatoes and peas",
        calories: 530, proteinG: 44, carbsG: 48, fatG: 18, prepMinutes: 25,
        ingredients: ["200g cod fillet", "300g new potatoes", "120g peas", "10g butter", "lemon", "parsley"],
        steps: ["Boil the potatoes 18 minutes, then crush with the butter and plenty of pepper.", "Cod on a tray at 200C for 12 minutes — it's done when it flakes.", "Peas in the last 3 minutes of the potatoes. Lemon over the fish."] },
      { dayOfWeek: 3, slot: "snack", sortOrder: 3, title: "Skyr with raspberries and dark chocolate",
        calories: 280, proteinG: 24, carbsG: 28, fatG: 8, prepMinutes: 2,
        ingredients: ["200g skyr", "80g raspberries", "12g dark chocolate"],
        steps: ["Skyr and raspberries in a bowl.", "Chop the chocolate over the top."] },

      // ── Friday ──
      { dayOfWeek: 4, slot: "breakfast", sortOrder: 0, title: "Smoked salmon scrambled eggs on rye",
        calories: 410, proteinG: 32, carbsG: 30, fatG: 18, prepMinutes: 10,
        ingredients: ["3 eggs", "60g smoked salmon", "1 slice rye bread", "chives", "black pepper"],
        steps: ["Scramble the eggs slowly and take them off while still soft.", "Fold the salmon through at the very end so it barely warms.", "Pile onto the toasted rye, chives and pepper over."] },
      { dayOfWeek: 4, slot: "lunch", sortOrder: 1, title: "Chicken caesar salad",
        calories: 486, proteinG: 42, carbsG: 30, fatG: 22, prepMinutes: 12,
        ingredients: ["160g chicken breast", "1 romaine heart", "25g parmesan", "30g croutons", "1.5 tbsp caesar dressing"],
        steps: ["Griddle the chicken and let it rest before slicing.", "Toss the lettuce with the dressing first, then everything else.", "Parmesan shaved over at the end."] },
      { dayOfWeek: 4, slot: "dinner", sortOrder: 2, title: "Homemade beef burger with sweet potato wedges",
        calories: 598, proteinG: 42, carbsG: 58, fatG: 22, prepMinutes: 30,
        ingredients: ["160g 5% beef mince", "1 wholemeal bun", "250g sweet potato", "lettuce, tomato, red onion", "1 tsp olive oil"],
        steps: ["Wedges with the oil at 200C, 30 minutes, turning once.", "Shape the mince into one patty, thumbprint in the middle, salt the outside only.", "Very hot pan, 4 minutes a side, don't press it.", "Build the burger with the salad."] },
      { dayOfWeek: 4, slot: "snack", sortOrder: 3, title: "Protein shake with a banana",
        calories: 276, proteinG: 28, carbsG: 32, fatG: 4, prepMinutes: 2,
        ingredients: ["1.5 scoops protein powder", "1 banana", "300ml water or skimmed milk"],
        steps: ["Blend or shake.", "Have it near training if you trained today."] },

      // ── Saturday ──
      { dayOfWeek: 5, slot: "breakfast", sortOrder: 0, title: "Greek yoghurt, berry and oat bowl",
        calories: 410, proteinG: 28, carbsG: 52, fatG: 10, prepMinutes: 5,
        ingredients: ["200g 0% Greek yoghurt", "40g oats", "120g mixed berries", "1 tsp honey", "10g mixed seeds"],
        steps: ["Oats in the bottom of the bowl, yoghurt over.", "Berries and seeds on top, honey to finish."] },
      { dayOfWeek: 5, slot: "lunch", sortOrder: 1, title: "Steak and rocket sandwich",
        calories: 472, proteinG: 38, carbsG: 44, fatG: 16, prepMinutes: 15,
        ingredients: ["140g minute steak", "2 slices sourdough", "handful rocket", "1 tomato", "1 tsp olive oil", "mustard"],
        steps: ["Very hot pan, steak 90 seconds a side, then rest 5 minutes.", "Slice it thinly against the grain.", "Build with mustard, rocket and tomato."] },
      { dayOfWeek: 5, slot: "dinner", sortOrder: 2, title: "Thai green chicken curry with rice",
        calories: 596, proteinG: 42, carbsG: 62, fatG: 20, prepMinutes: 30,
        ingredients: ["180g chicken breast", "1 tbsp green curry paste", "150ml light coconut milk", "green beans and peppers", "1 pouch jasmine rice", "lime"],
        steps: ["Fry the paste in a dry pan for a minute until it smells strong.", "Chicken in to coat, then the coconut milk and vegetables.", "Simmer 12 minutes. Lime squeezed in at the end, off the heat."] },
      { dayOfWeek: 5, slot: "snack", sortOrder: 3, title: "Cottage cheese with apple, cinnamon and almonds",
        calories: 344, proteinG: 22, carbsG: 28, fatG: 16, prepMinutes: 3,
        ingredients: ["150g cottage cheese", "1 apple", "20g almonds", "cinnamon"],
        steps: ["Chop the apple.", "Cottage cheese in a bowl with the apple and almonds.", "Good pinch of cinnamon over."] },

      // ── Sunday ──
      { dayOfWeek: 6, slot: "breakfast", sortOrder: 0, title: "Poached eggs with bacon, mushrooms and toast",
        calories: 444, proteinG: 32, carbsG: 34, fatG: 20, prepMinutes: 15,
        ingredients: ["2 eggs", "2 rashers back bacon", "100g mushrooms", "cherry tomatoes", "1 slice sourdough"],
        steps: ["Bacon under the grill, mushrooms and tomatoes in a hot pan.", "Poach the eggs in barely simmering water, 3 minutes.", "Everything on the toast."] },
      { dayOfWeek: 6, slot: "lunch", sortOrder: 1, title: "Roast chicken with roast potatoes and greens",
        calories: 538, proteinG: 44, carbsG: 50, fatG: 18, prepMinutes: 40,
        ingredients: ["180g roast chicken breast", "250g potatoes", "carrots", "greens", "1 tbsp olive oil", "gravy"],
        steps: ["Potatoes and carrots in hot oil at 200C, 40 minutes, turned twice.", "Steam the greens for the last 5 minutes.", "Carve the chicken, plate up, gravy over."] },
      { dayOfWeek: 6, slot: "dinner", sortOrder: 2, title: "Salmon with pesto orzo and courgette",
        calories: 558, proteinG: 38, carbsG: 52, fatG: 22, prepMinutes: 25,
        ingredients: ["140g salmon fillet", "70g dry orzo", "1 courgette", "1 tbsp pesto", "lemon"],
        steps: ["Salmon skin-side down in a hot pan, 4 minutes, then 2 on the flesh side.", "Boil the orzo, ribbon the courgette and toss it in for the last minute.", "Stir the pesto through the orzo, salmon on top, lemon over."] },
      { dayOfWeek: 6, slot: "snack", sortOrder: 3, title: "Greek yoghurt with honey and pistachios",
        calories: 266, proteinG: 18, carbsG: 26, fatG: 10, prepMinutes: 2,
        ingredients: ["150g Greek yoghurt", "1 tsp honey", "15g pistachios"],
        steps: ["Yoghurt in a bowl, honey over.", "Chop the pistachios and scatter."] },
    ],
  },

  /* ── 3. Vegetarian, 1500 kcal, minimal cooking ───────────────────────────
   * Protein is the hard part of a vegetarian week at this calorie level, so
   * dairy, eggs, pulses, tofu and paneer do the heavy lifting in every meal.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "veggie-1500-minimal",
    name: "Vegetarian — 1500",
    description: "A vegetarian week that still gets over 105g of protein a day, built from dairy, eggs and pulses with barely any cooking.",
    baseCalories: 1500,
    baseProteinG: 105,
    dietaryTags: ["vegetarian"],
    cookingSkill: "minimal",
    contains: [
      "greek yoghurt", "berries", "oats", "seeds", "halloumi", "chickpeas",
      "peppers", "tofu", "noodles", "soy sauce", "protein powder", "banana",
      "eggs", "feta", "bread", "lentils", "tomatoes", "black beans", "rice",
      "skyr", "almonds", "blueberries", "cottage cheese", "avocado", "rye bread",
      "paneer", "spinach", "curry sauce", "pumpkin seeds", "honey",
      "peanut butter", "mayonnaise", "satsuma", "red lentils", "granola",
      "raspberries", "falafel", "hummus", "tortilla wrap", "kidney beans",
      "soya mince", "apple", "mushrooms", "cheddar", "butter beans", "olives",
      "pitta bread", "aubergine", "couscous", "baked beans", "mozzarella",
      "pesto", "ricotta", "tortelloni", "parmesan", "dark chocolate",
      "walnuts", "pineapple", "olive oil", "cucumber", "onion", "lemon",
    ],
    meals: [
      // ── Monday ──
      { dayOfWeek: 0, slot: "breakfast", sortOrder: 0, title: "Greek yoghurt with berries, oats and seeds",
        calories: 361, proteinG: 26, carbsG: 44, fatG: 9, prepMinutes: 3,
        ingredients: ["200g 0% Greek yoghurt", "35g oats", "100g mixed berries", "10g mixed seeds"],
        steps: ["Oats in the bowl first, yoghurt over them.", "Berries and seeds on top.", "Leave it in the fridge overnight if you prefer softer oats."] },
      { dayOfWeek: 0, slot: "lunch", sortOrder: 1, title: "Halloumi, chickpea and roasted pepper salad",
        calories: 392, proteinG: 28, carbsG: 34, fatG: 16, prepMinutes: 10,
        ingredients: ["70g halloumi", "200g tinned chickpeas", "roasted peppers from a jar", "salad leaves", "lemon juice"],
        steps: ["Dry-fry the halloumi 2 minutes a side until it colours.", "Rinse the chickpeas and toss with the peppers and leaves.", "Halloumi on top, lemon over while it's still hot."] },
      { dayOfWeek: 0, slot: "dinner", sortOrder: 2, title: "Tofu and vegetable stir-fry with noodles",
        calories: 478, proteinG: 30, carbsG: 58, fatG: 14, prepMinutes: 15,
        ingredients: ["200g firm tofu", "1 pack stir-fry vegetables", "1 nest egg noodles", "soy sauce", "garlic and ginger", "1 tsp oil"],
        steps: ["Press the tofu between kitchen paper, cube it, fry until golden on all sides.", "Vegetables, garlic and ginger in for 4 minutes.", "Cooked noodles and soy sauce in, toss and serve."] },
      { dayOfWeek: 0, slot: "snack", sortOrder: 3, title: "Protein shake with a banana",
        calories: 239, proteinG: 25, carbsG: 28, fatG: 3, prepMinutes: 2,
        ingredients: ["1 scoop protein powder", "1 banana", "250ml water or milk"],
        steps: ["Shake or blend.", "Banana alongside if you'd rather chew it."] },

      // ── Tuesday ──
      { dayOfWeek: 1, slot: "breakfast", sortOrder: 0, title: "Scrambled eggs with feta on toast",
        calories: 376, proteinG: 26, carbsG: 32, fatG: 16, prepMinutes: 8,
        ingredients: ["3 eggs", "25g feta", "1 slice wholemeal bread", "chives"],
        steps: ["Scramble the eggs slowly on a low heat.", "Crumble the feta in right at the end.", "Onto the toast, chives over."] },
      { dayOfWeek: 1, slot: "lunch", sortOrder: 1, title: "Lentil, feta and tomato salad box",
        calories: 388, proteinG: 26, carbsG: 44, fatG: 12, prepMinutes: 6,
        ingredients: ["250g pouch cooked puy lentils", "40g feta", "cherry tomatoes", "cucumber", "red onion", "1 tsp olive oil", "lemon"],
        steps: ["Tip the lentils into a box.", "Chop the vegetables in, crumble the feta over.", "Oil and lemon on top, shake the box to mix."] },
      { dayOfWeek: 1, slot: "dinner", sortOrder: 2, title: "Black bean and halloumi burrito bowl",
        calories: 486, proteinG: 32, carbsG: 58, fatG: 14, prepMinutes: 15,
        ingredients: ["200g tinned black beans", "60g halloumi", "1 pouch rice", "sweetcorn", "salsa", "lime", "coriander"],
        steps: ["Warm the beans with a little cumin and salsa.", "Dry-fry the halloumi until browned.", "Rice, beans, halloumi and sweetcorn in a bowl, lime squeezed over."] },
      { dayOfWeek: 1, slot: "snack", sortOrder: 3, title: "Skyr with almonds",
        calories: 249, proteinG: 22, carbsG: 20, fatG: 9, prepMinutes: 1,
        ingredients: ["200g skyr", "15g almonds"],
        steps: ["Skyr into a bowl or straight from the pot.", "Almonds roughly chopped over it."] },

      // ── Wednesday ──
      { dayOfWeek: 2, slot: "breakfast", sortOrder: 0, title: "Overnight oats with protein powder and blueberries",
        calories: 376, proteinG: 30, carbsG: 46, fatG: 8, prepMinutes: 5,
        ingredients: ["55g oats", "1 scoop vanilla protein powder", "150ml milk", "80g blueberries"],
        steps: ["Stir the oats, powder and milk together in a jar.", "Fridge overnight.", "Blueberries on in the morning."] },
      { dayOfWeek: 2, slot: "lunch", sortOrder: 1, title: "Cottage cheese, avocado and tomato on rye",
        calories: 366, proteinG: 26, carbsG: 34, fatG: 14, prepMinutes: 5,
        ingredients: ["2 slices rye bread", "150g cottage cheese", "1/2 avocado", "1 tomato", "black pepper"],
        steps: ["Toast the rye.", "Cottage cheese on both slices, avocado smashed over one.", "Sliced tomato, salt and a lot of pepper."] },
      { dayOfWeek: 2, slot: "dinner", sortOrder: 2, title: "Paneer and spinach curry with rice",
        calories: 488, proteinG: 30, carbsG: 56, fatG: 16, prepMinutes: 18,
        ingredients: ["120g paneer", "200g spinach", "1/2 jar tikka or korma sauce", "1 pouch basmati rice", "1 tsp oil"],
        steps: ["Brown the cubed paneer in the oil, then lift it out.", "Sauce in the pan, wilt the spinach through it.", "Paneer back in for 3 minutes, serve over the rice."] },
      { dayOfWeek: 2, slot: "snack", sortOrder: 3, title: "Greek yoghurt with pumpkin seeds and honey",
        calories: 256, proteinG: 20, carbsG: 26, fatG: 8, prepMinutes: 2,
        ingredients: ["170g Greek yoghurt", "15g pumpkin seeds", "1 tsp honey"],
        steps: ["Yoghurt in a bowl.", "Seeds scattered over, honey to finish."] },

      // ── Thursday ──
      { dayOfWeek: 3, slot: "breakfast", sortOrder: 0, title: "Peanut butter and banana protein smoothie",
        calories: 363, proteinG: 30, carbsG: 36, fatG: 11, prepMinutes: 3,
        ingredients: ["1 scoop protein powder", "1 banana", "15g peanut butter", "250ml milk", "ice"],
        steps: ["Everything in the blender for 30 seconds.", "Loosen with more milk if it's too thick."] },
      { dayOfWeek: 3, slot: "lunch", sortOrder: 1, title: "Egg mayo and spinach sandwich with a satsuma",
        calories: 388, proteinG: 24, carbsG: 46, fatG: 12, prepMinutes: 8,
        ingredients: ["3 eggs", "2 slices wholemeal bread", "1 tbsp light mayonnaise", "handful spinach", "1 satsuma"],
        steps: ["Boil the eggs 8 minutes, cool under the tap, peel and roughly mash.", "Mix with the mayonnaise, plenty of pepper.", "Onto the bread with the spinach. Satsuma on the side."] },
      { dayOfWeek: 3, slot: "dinner", sortOrder: 2, title: "Red lentil dahl with rice and yoghurt",
        calories: 466, proteinG: 30, carbsG: 64, fatG: 10, prepMinutes: 25,
        ingredients: ["100g red lentils", "1 onion", "garlic, ginger, cumin, turmeric", "1 pouch rice", "60g Greek yoghurt", "1 tsp oil"],
        steps: ["Soften the onion, then the spices for a minute.", "Lentils and 400ml water in, simmer 20 minutes until collapsed.", "Serve over rice with the yoghurt spooned on top."] },
      { dayOfWeek: 3, slot: "snack", sortOrder: 3, title: "Cottage cheese with pineapple and walnuts",
        calories: 257, proteinG: 22, carbsG: 22, fatG: 9, prepMinutes: 2,
        ingredients: ["170g cottage cheese", "100g pineapple", "10g walnuts"],
        steps: ["Cottage cheese in a bowl, pineapple on top.", "Break the walnuts over."] },

      // ── Friday ──
      { dayOfWeek: 4, slot: "breakfast", sortOrder: 0, title: "Skyr bowl with granola and raspberries",
        calories: 359, proteinG: 28, carbsG: 46, fatG: 7, prepMinutes: 3,
        ingredients: ["200g skyr", "35g granola", "100g raspberries"],
        steps: ["Skyr in a bowl.", "Granola and raspberries over the top."] },
      { dayOfWeek: 4, slot: "lunch", sortOrder: 1, title: "Falafel and hummus wrap",
        calories: 432, proteinG: 22, carbsG: 50, fatG: 16, prepMinutes: 8,
        ingredients: ["4 falafel", "1 large wholemeal wrap", "50g hummus", "salad leaves", "tomato", "cucumber"],
        steps: ["Warm the falafel through in a pan or the microwave.", "Hummus over the wrap, then the salad and crushed falafel.", "Roll tight and cut in half."] },
      { dayOfWeek: 4, slot: "dinner", sortOrder: 2, title: "Veggie chilli with rice",
        calories: 466, proteinG: 32, carbsG: 62, fatG: 10, prepMinutes: 20,
        ingredients: ["100g soya mince", "200g tinned kidney beans", "1 tin chopped tomatoes", "1 onion", "chilli and cumin", "1 pouch rice"],
        steps: ["Soften the onion, add the spices for a minute.", "Soya mince, tomatoes and drained beans in, simmer 12 minutes.", "Serve over the rice."] },
      { dayOfWeek: 4, slot: "snack", sortOrder: 3, title: "Protein yoghurt with an apple",
        calories: 226, proteinG: 24, carbsG: 28, fatG: 2, prepMinutes: 2,
        ingredients: ["200g high-protein yoghurt", "1 apple"],
        steps: ["Slice the apple.", "Eat it with the yoghurt — the fruit does more for fullness sliced than whole."] },

      // ── Saturday ──
      { dayOfWeek: 5, slot: "breakfast", sortOrder: 0, title: "Mushroom and cheddar omelette with toast",
        calories: 394, proteinG: 28, carbsG: 30, fatG: 18, prepMinutes: 12,
        ingredients: ["3 eggs", "80g mushrooms", "25g cheddar", "1 slice wholemeal bread", "1 tsp oil"],
        steps: ["Fry the mushrooms until properly browned — most people stop too early.", "Beaten eggs over a low heat, lift the edges as they set.", "Cheese on, fold, serve with the toast."] },
      { dayOfWeek: 5, slot: "lunch", sortOrder: 1, title: "Greek salad with butter beans and pitta",
        calories: 416, proteinG: 24, carbsG: 44, fatG: 16, prepMinutes: 8,
        ingredients: ["200g tinned butter beans", "40g feta", "cucumber, tomato, red onion", "8 olives", "1 wholemeal pitta", "1 tsp olive oil", "oregano"],
        steps: ["Rinse the beans and combine with the chopped vegetables and olives.", "Feta crumbled over, oil and oregano on top.", "Toast the pitta and tear it in."] },
      { dayOfWeek: 5, slot: "dinner", sortOrder: 2, title: "Aubergine, chickpea and halloumi traybake with couscous",
        calories: 472, proteinG: 30, carbsG: 52, fatG: 16, prepMinutes: 30,
        ingredients: ["1 aubergine", "200g tinned chickpeas", "60g halloumi", "50g dry couscous", "1 tsp olive oil", "harissa or paprika"],
        steps: ["Oven 200C. Aubergine and chickpeas with the oil and spice, 20 minutes.", "Add the cubed halloumi, 8 minutes more.", "Couscous covered with boiling water for 5 minutes, forked through, tray tipped over it."] },
      { dayOfWeek: 5, slot: "snack", sortOrder: 3, title: "Protein shake with berries",
        calories: 203, proteinG: 26, carbsG: 18, fatG: 3, prepMinutes: 2,
        ingredients: ["1 scoop protein powder", "100g mixed berries", "250ml water"],
        steps: ["Blend the powder, berries, water and ice.", "Or shake the powder plain and eat the berries alongside."] },

      // ── Sunday ──
      { dayOfWeek: 6, slot: "breakfast", sortOrder: 0, title: "Baked beans on toast with grated cheese",
        calories: 410, proteinG: 26, carbsG: 54, fatG: 10, prepMinutes: 8,
        ingredients: ["200g baked beans", "2 slices wholemeal bread", "30g cheddar"],
        steps: ["Beans on a low heat while the bread toasts.", "Beans over the toast, cheese grated on while it's hot."] },
      { dayOfWeek: 6, slot: "lunch", sortOrder: 1, title: "Caprese and pesto sandwich with salad",
        calories: 416, proteinG: 26, carbsG: 42, fatG: 16, prepMinutes: 6,
        ingredients: ["2 slices sourdough", "100g light mozzarella", "1 tomato", "1 tsp pesto", "basil", "side salad"],
        steps: ["Pesto on one slice, basil leaves on it.", "Sliced mozzarella and tomato, salt and pepper.", "Press together, salad alongside."] },
      { dayOfWeek: 6, slot: "dinner", sortOrder: 2, title: "Spinach and ricotta tortelloni with tomato sauce",
        calories: 463, proteinG: 32, carbsG: 50, fatG: 15, prepMinutes: 12,
        ingredients: ["250g fresh spinach and ricotta tortelloni", "1/2 jar tomato sauce", "large handful spinach", "25g parmesan"],
        steps: ["Tortelloni into boiling water, 3 minutes.", "Warm the sauce and wilt the extra spinach through it.", "Drain the pasta into the sauce, parmesan over."] },
      { dayOfWeek: 6, slot: "snack", sortOrder: 3, title: "Skyr with dark chocolate",
        calories: 237, proteinG: 24, carbsG: 24, fatG: 5, prepMinutes: 2,
        ingredients: ["200g skyr", "12g dark chocolate", "1 tsp honey"],
        steps: ["Skyr in a bowl with the honey stirred through.", "Chocolate chopped over the top."] },
    ],
  },

  /* ── 4. Omnivore high protein, 1600 kcal, minimal cooking ────────────────
   * Around 150g of protein a day at 1600 calories — for a deficit alongside
   * lifting, where holding onto muscle is the whole point. Still assembly
   * rather than cooking.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "high-protein-omnivore-1600",
    name: "High Protein Omnivore — 1600",
    description: "About 150g of protein a day at 1600 calories with almost no cooking, for holding onto muscle while you're eating less.",
    baseCalories: 1600,
    baseProteinG: 145,
    dietaryTags: ["high-protein"],
    cookingSkill: "minimal",
    contains: [
      "skyr", "granola", "berries", "chicken", "rice", "peppers", "courgette",
      "beef mince", "spaghetti", "tomato sauce", "cottage cheese", "cucumber",
      "rye crackers", "eggs", "turkey", "bread", "tuna", "sweetcorn", "potato",
      "couscous", "salad leaves", "protein powder", "banana", "oats",
      "blueberries", "prawns", "edamame", "noodles", "salmon", "new potatoes",
      "asparagus", "almonds", "peaches", "parmesan", "croutons",
      "caesar dressing", "turkey mince", "kidney beans", "greek yoghurt",
      "smoked salmon", "rye bread", "black beans", "salsa", "white fish",
      "green beans", "dark chocolate", "raspberries", "steak", "pitta bread",
      "tzatziki", "pineapple", "baked beans", "tofu", "soy sauce", "apple",
      "satsuma", "olive oil", "lemon", "onion",
    ],
    meals: [
      // ── Monday ──
      { dayOfWeek: 0, slot: "breakfast", sortOrder: 0, title: "Skyr with protein granola and berries",
        calories: 382, proteinG: 40, carbsG: 42, fatG: 6, prepMinutes: 3,
        ingredients: ["250g skyr", "1/2 scoop protein powder", "35g granola", "100g mixed berries"],
        steps: ["Stir the protein powder through the skyr with a splash of water.", "Granola and berries over the top."] },
      { dayOfWeek: 0, slot: "lunch", sortOrder: 1, title: "Chicken, rice and roasted vegetable box",
        calories: 454, proteinG: 45, carbsG: 46, fatG: 10, prepMinutes: 10,
        ingredients: ["170g cooked chicken breast", "180g cooked rice", "roasted peppers and courgette", "1 tsp olive oil", "lemon"],
        steps: ["Rice into the box, vegetables on top.", "Sliced chicken over, oil and lemon.", "Make three of these at once on a Sunday and lunch is handled."] },
      { dayOfWeek: 0, slot: "dinner", sortOrder: 2, title: "Beef bolognese with wholewheat spaghetti",
        calories: 488, proteinG: 45, carbsG: 50, fatG: 12, prepMinutes: 20,
        ingredients: ["180g 5% beef mince", "70g dry wholewheat spaghetti", "1/2 jar tomato pasta sauce", "1/2 onion", "garlic"],
        steps: ["Brown the mince hard with the onion and garlic.", "Sauce in, simmer 10 minutes while the pasta cooks.", "Drain the pasta into the sauce rather than the other way round."] },
      { dayOfWeek: 0, slot: "snack", sortOrder: 3, title: "Cottage cheese with cucumber and rye crackers",
        calories: 268, proteinG: 22, carbsG: 36, fatG: 4, prepMinutes: 3,
        ingredients: ["150g cottage cheese", "4 rye crackers", "cucumber", "black pepper"],
        steps: ["Cottage cheese onto the crackers.", "Cucumber slices on top, plenty of pepper."] },

      // ── Tuesday ──
      { dayOfWeek: 1, slot: "breakfast", sortOrder: 0, title: "Egg scramble with turkey rashers on toast",
        calories: 402, proteinG: 40, carbsG: 38, fatG: 10, prepMinutes: 10,
        ingredients: ["2 eggs", "150g liquid egg white", "3 turkey rashers", "2 slices wholemeal bread"],
        steps: ["Grill the turkey rashers while the bread toasts.", "Scramble the eggs and whites together on a low heat.", "Everything on the toast."] },
      { dayOfWeek: 1, slot: "lunch", sortOrder: 1, title: "Tuna and cottage cheese jacket potato",
        calories: 442, proteinG: 45, carbsG: 52, fatG: 6, prepMinutes: 12,
        ingredients: ["1 medium baking potato", "1 tin tuna, drained", "100g cottage cheese", "sweetcorn", "side salad"],
        steps: ["Microwave the potato 8 minutes.", "Mix the tuna, cottage cheese and sweetcorn — it replaces the mayonnaise entirely.", "Split the potato and pile it in."] },
      { dayOfWeek: 1, slot: "dinner", sortOrder: 2, title: "Grilled chicken thighs with couscous and salad",
        calories: 482, proteinG: 45, carbsG: 44, fatG: 14, prepMinutes: 20,
        ingredients: ["200g chicken thighs, skin off", "60g dry couscous", "salad leaves, tomato, cucumber", "1 tsp olive oil", "lemon and paprika"],
        steps: ["Rub the chicken with paprika, grill 8 minutes a side.", "Couscous under boiling water, covered, 5 minutes, then forked through with lemon.", "Salad alongside, oil over the lot."] },
      { dayOfWeek: 1, slot: "snack", sortOrder: 3, title: "Protein shake with a banana",
        calories: 267, proteinG: 30, carbsG: 30, fatG: 3, prepMinutes: 2,
        ingredients: ["1.5 scoops protein powder", "1 banana", "300ml water"],
        steps: ["Shake or blend.", "Best placed near training on a lifting day."] },

      // ── Wednesday ──
      { dayOfWeek: 2, slot: "breakfast", sortOrder: 0, title: "Protein overnight oats with blueberries",
        calories: 408, proteinG: 38, carbsG: 46, fatG: 8, prepMinutes: 5,
        ingredients: ["50g oats", "1.5 scoops protein powder", "150g skyr", "150ml milk", "80g blueberries"],
        steps: ["Oats, powder, skyr and milk stirred in a jar.", "Fridge overnight.", "Blueberries on in the morning."] },
      { dayOfWeek: 2, slot: "lunch", sortOrder: 1, title: "Prawn and edamame noodle salad",
        calories: 408, proteinG: 40, carbsG: 44, fatG: 8, prepMinutes: 10,
        ingredients: ["200g cooked prawns", "100g edamame beans", "1 nest rice noodles", "cucumber and spring onion", "soy sauce, lime, chilli"],
        steps: ["Soak the noodles in boiling water for 4 minutes, then cool under the tap.", "Toss with the prawns, edamame and vegetables.", "Dress with soy, lime and chilli."] },
      { dayOfWeek: 2, slot: "dinner", sortOrder: 2, title: "Salmon with new potatoes and asparagus",
        calories: 482, proteinG: 40, carbsG: 40, fatG: 18, prepMinutes: 20,
        ingredients: ["150g salmon fillet", "220g new potatoes", "150g asparagus", "1 tsp olive oil", "lemon"],
        steps: ["Boil the potatoes 18 minutes.", "Salmon on a tray at 200C for 12 minutes.", "Asparagus in the pan with the potatoes for the last 3 minutes. Lemon over."] },
      { dayOfWeek: 2, slot: "snack", sortOrder: 3, title: "Skyr with almonds",
        calories: 265, proteinG: 28, carbsG: 18, fatG: 9, prepMinutes: 1,
        ingredients: ["250g skyr", "15g almonds"],
        steps: ["Skyr into a bowl.", "Chop the almonds over it."] },

      // ── Thursday ──
      { dayOfWeek: 3, slot: "breakfast", sortOrder: 0, title: "Cottage cheese with peaches and granola",
        calories: 391, proteinG: 38, carbsG: 44, fatG: 7, prepMinutes: 3,
        ingredients: ["250g cottage cheese", "1/2 scoop protein powder", "1 peach", "30g granola"],
        steps: ["Blend the cottage cheese with the protein powder if you want it smooth — or don't.", "Sliced peach and granola on top."] },
      { dayOfWeek: 3, slot: "lunch", sortOrder: 1, title: "Chicken caesar salad with extra chicken",
        calories: 480, proteinG: 48, carbsG: 36, fatG: 16, prepMinutes: 8,
        ingredients: ["200g cooked chicken breast", "1 romaine heart", "20g parmesan", "40g croutons", "1 tbsp light caesar dressing"],
        steps: ["Shred the lettuce, toss with the dressing.", "Chicken, croutons and parmesan over.", "Eat it straight away or the croutons go soft."] },
      { dayOfWeek: 3, slot: "dinner", sortOrder: 2, title: "Turkey chilli with rice",
        calories: 482, proteinG: 46, carbsG: 52, fatG: 10, prepMinutes: 20,
        ingredients: ["180g turkey mince", "200g tinned kidney beans", "1 tin chopped tomatoes", "1/2 onion", "chilli and cumin", "1 pouch rice"],
        steps: ["Brown the turkey with the onion — it needs more oil and more heat than beef.", "Spices, tomatoes and drained beans in, simmer 12 minutes.", "Over the rice."] },
      { dayOfWeek: 3, slot: "snack", sortOrder: 3, title: "Greek yoghurt with a satsuma",
        calories: 244, proteinG: 28, carbsG: 24, fatG: 4, prepMinutes: 2,
        ingredients: ["250g 0% Greek yoghurt", "1/2 scoop protein powder", "2 satsumas"],
        steps: ["Stir the powder through the yoghurt.", "Satsuma segments on top."] },

      // ── Friday ──
      { dayOfWeek: 4, slot: "breakfast", sortOrder: 0, title: "Smoked salmon and scrambled egg on rye",
        calories: 398, proteinG: 36, carbsG: 32, fatG: 14, prepMinutes: 10,
        ingredients: ["2 eggs", "100g liquid egg white", "80g smoked salmon", "1 slice rye bread", "chives"],
        steps: ["Scramble the eggs and whites slowly, take them off while soft.", "Fold the salmon through at the end.", "Onto the toasted rye with chives and pepper."] },
      { dayOfWeek: 4, slot: "lunch", sortOrder: 1, title: "Chicken and black bean burrito bowl",
        calories: 470, proteinG: 45, carbsG: 50, fatG: 10, prepMinutes: 10,
        ingredients: ["170g cooked chicken breast", "150g tinned black beans", "150g cooked rice", "salsa", "lime", "coriander"],
        steps: ["Rice in the bowl, warmed beans over it.", "Chicken on top with the salsa.", "Lime squeezed over and coriander torn in."] },
      { dayOfWeek: 4, slot: "dinner", sortOrder: 2, title: "White fish with roast potatoes and green beans",
        calories: 436, proteinG: 42, carbsG: 40, fatG: 12, prepMinutes: 25,
        ingredients: ["200g white fish fillet", "220g potatoes", "150g green beans", "1 tsp olive oil", "lemon and parsley"],
        steps: ["Potatoes cubed with the oil at 200C, 25 minutes.", "Fish on the tray for the last 12 minutes.", "Steam the beans, lemon and parsley over everything."] },
      { dayOfWeek: 4, slot: "snack", sortOrder: 3, title: "Skyr with raspberries and dark chocolate",
        calories: 270, proteinG: 28, carbsG: 26, fatG: 6, prepMinutes: 2,
        ingredients: ["250g skyr", "80g raspberries", "10g dark chocolate"],
        steps: ["Skyr and raspberries in a bowl.", "Chocolate chopped over."] },

      // ── Saturday ──
      { dayOfWeek: 5, slot: "breakfast", sortOrder: 0, title: "Protein pancakes with yoghurt and raspberries",
        calories: 409, proteinG: 38, carbsG: 44, fatG: 9, prepMinutes: 12,
        ingredients: ["40g oats", "1.5 scoops protein powder", "1 egg", "100g Greek yoghurt", "100g raspberries", "1 tsp oil"],
        steps: ["Blend the oats, powder and egg with a splash of milk.", "Small pancakes in a lightly oiled pan, 90 seconds a side.", "Yoghurt and raspberries on top."] },
      { dayOfWeek: 5, slot: "lunch", sortOrder: 1, title: "Steak salad with new potatoes",
        calories: 438, proteinG: 44, carbsG: 34, fatG: 14, prepMinutes: 15,
        ingredients: ["160g sirloin steak", "180g new potatoes", "salad leaves, tomato, red onion", "1 tsp olive oil", "mustard dressing"],
        steps: ["Boil the potatoes, then halve them.", "Steak in a very hot pan, 3 minutes a side, rest 5 minutes before slicing.", "Everything tossed together with the dressing."] },
      { dayOfWeek: 5, slot: "dinner", sortOrder: 2, title: "Chicken shawarma pitta with garlic yoghurt",
        calories: 462, proteinG: 45, carbsG: 48, fatG: 10, prepMinutes: 20,
        ingredients: ["180g chicken breast", "1 wholemeal pitta", "60g tzatziki", "salad leaves, tomato, red onion", "cumin, paprika, garlic", "1 tsp olive oil"],
        steps: ["Toss the sliced chicken with the spices and oil.", "Hot pan, 8 minutes until browned at the edges.", "Warm the pitta and fill with chicken, salad and tzatziki."] },
      { dayOfWeek: 5, slot: "snack", sortOrder: 3, title: "Cottage cheese with pineapple and almonds",
        calories: 300, proteinG: 26, carbsG: 22, fatG: 12, prepMinutes: 2,
        ingredients: ["180g cottage cheese", "100g pineapple", "18g almonds"],
        steps: ["Cottage cheese in a bowl with the pineapple.", "Almonds roughly chopped over."] },

      // ── Sunday ──
      { dayOfWeek: 6, slot: "breakfast", sortOrder: 0, title: "Baked beans with poached eggs on toast",
        calories: 436, proteinG: 32, carbsG: 50, fatG: 12, prepMinutes: 10,
        ingredients: ["200g baked beans", "2 eggs", "1 slice wholemeal bread", "50g liquid egg white"],
        steps: ["Beans on a low heat, bread in the toaster.", "Poach the eggs in barely simmering water for 3 minutes.", "Beans on the toast, eggs on top."] },
      { dayOfWeek: 6, slot: "lunch", sortOrder: 1, title: "Roast chicken with couscous and salad",
        calories: 442, proteinG: 46, carbsG: 42, fatG: 10, prepMinutes: 10,
        ingredients: ["180g roast chicken breast", "60g dry couscous", "salad leaves, tomato, cucumber", "1 tsp olive oil", "lemon"],
        steps: ["Couscous covered with boiling water for 5 minutes, then forked through with the lemon.", "Chicken sliced over it.", "Salad alongside with the oil."] },
      { dayOfWeek: 6, slot: "dinner", sortOrder: 2, title: "Prawn and tofu stir-fry with rice",
        calories: 450, proteinG: 42, carbsG: 48, fatG: 10, prepMinutes: 15,
        ingredients: ["150g raw prawns", "120g firm tofu", "1 pack stir-fry vegetables", "1 pouch rice", "soy sauce, garlic, ginger", "1 tsp oil"],
        steps: ["Fry the cubed tofu until golden, then set aside.", "Vegetables 4 minutes, prawns 3 minutes until pink.", "Tofu back in with the rice and soy, toss through."] },
      { dayOfWeek: 6, slot: "snack", sortOrder: 3, title: "Protein shake with an apple",
        calories: 251, proteinG: 30, carbsG: 26, fatG: 3, prepMinutes: 2,
        ingredients: ["1.5 scoops protein powder", "1 apple", "300ml water"],
        steps: ["Shake the protein powder with the water.", "Eat the apple alongside it."] },
    ],
  },
];
