import { describe, expect, it } from "vitest";
import { foodLine, foodUnitsOf, gramsLabel, millilitresLabel, quantityLabel, temperatureLabel } from "@/lib/food-units";

describe("food units follow the body unless set", () => {
  it("falls back to body units", () => {
    expect(foodUnitsOf({ units: "imperial", foodUnits: null })).toBe("imperial");
    expect(foodUnitsOf({ units: "metric", foodUnits: null })).toBe("metric");
  });
  it("splits when she says so", () => {
    expect(foodUnitsOf({ units: "metric", foodUnits: "imperial" })).toBe("imperial");
    expect(foodUnitsOf({ units: "imperial", foodUnits: "metric" })).toBe("metric");
  });
});

describe("labels", () => {
  it("weights", () => {
    expect(gramsLabel(100, "metric")).toBe("100 g");
    expect(gramsLabel(1500, "metric")).toBe("1.5 kg");
    expect(gramsLabel(100, "imperial")).toBe("3.5 oz");
    expect(gramsLabel(250, "imperial")).toBe("8.8 oz");
    expect(gramsLabel(300, "imperial")).toBe("11 oz");
    expect(gramsLabel(454, "imperial")).toBe("1 lb");
    expect(gramsLabel(1000, "imperial")).toBe("2.2 lb");
  });
  it("volumes", () => {
    expect(millilitresLabel(15, "metric")).toBe("15 ml");
    expect(millilitresLabel(15, "imperial")).toBe("0.5 fl oz");
    expect(millilitresLabel(240, "imperial")).toBe("1 cup");
    expect(millilitresLabel(500, "imperial")).toBe("2 cups");
    expect(millilitresLabel(300, "imperial")).toBe("1¼ cups");
    expect(millilitresLabel(1000, "metric")).toBe("1 l");
  });
  it("oven temperatures land on the dial", () => {
    expect(temperatureLabel(200, "imperial")).toBe("400°F");
    expect(temperatureLabel(180, "imperial")).toBe("350°F");
    expect(temperatureLabel(220, "imperial")).toBe("425°F");
    expect(temperatureLabel(200, "metric")).toBe("200°C");
  });
});

describe("foodLine rewrites measures in text", () => {
  it("metric recipe for an imperial cook", () => {
    expect(foodLine("250g chicken breast", "imperial")).toBe("8.8 oz chicken breast");
    expect(foodLine("1 kg potatoes", "imperial")).toBe("2.2 lb potatoes");
    expect(foodLine("200 ml milk", "imperial")).toBe("6.8 fl oz milk");
    expect(foodLine("1 l stock", "imperial")).toBe("4¼ cups stock");
    expect(foodLine("Oven 200C for 20 min", "imperial")).toBe("Oven 400°F for 20 min");
    expect(foodLine("Roast at 180 °C", "imperial")).toBe("Roast at 350°F");
  });
  it("leaves counts, named measures and words alone", () => {
    for (const line of ["2 eggs", "1 tbsp olive oil", "2 large tomatoes", "1 lb mince", "5 garlic cloves", "vitamin C", "300 Calories"]) {
      expect(foodLine(line, "imperial")).toBe(line);
    }
    expect(foodLine("2 eggs", "metric")).toBe("2 eggs");
    expect(foodLine("1 cup oats", "metric")).toBe("1 cup oats");
  });
  it("imperial line for a metric cook", () => {
    expect(foodLine("4oz salmon", "metric")).toBe("115 g salmon");
    expect(foodLine("1 lb mince", "metric")).toBe("450 g mince");
    expect(foodLine("8 fl oz milk", "metric")).toBe("235 ml milk");
    expect(foodLine("Bake at 400F", "metric")).toBe("Bake at 205°C");
  });
  it("is a no-op when the line is already in her units", () => {
    expect(foodLine("250g chicken breast", "metric")).toBe("250g chicken breast");
    expect(foodLine("8 oz chicken breast", "imperial")).toBe("8 oz chicken breast");
  });
});

describe("shopping quantities", () => {
  it("converts weights and volumes, keeps named measures", () => {
    expect(quantityLabel(250, "g", "metric")).toBe("250g");
    expect(quantityLabel(250, "g", "imperial")).toBe("8.8 oz");
    expect(quantityLabel(2, "tbsp", "imperial")).toBe("2 tbsp");
    expect(quantityLabel(6, null, "imperial")).toBe("6");
    expect(quantityLabel(1.5, "l", "imperial")).toBe("6¼ cups");
    expect(quantityLabel(1, "lb", "metric")).toBe("450 g");
  });
});
