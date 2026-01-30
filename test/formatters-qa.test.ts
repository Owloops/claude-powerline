import {
  CostColorLevel,
  getCostColorLevel,
  formatBurnRate,
  formatCacheHitRate,
  formatCost,
} from "../src/utils/formatters";

describe("Formatter QA Tests", () => {
  describe("1. CostColorLevel type", () => {
    it("should exist and be 'normal' | 'warning' | 'critical'", () => {
      const normalLevel: CostColorLevel = "normal";
      const warningLevel: CostColorLevel = "warning";
      const criticalLevel: CostColorLevel = "critical";

      expect(normalLevel).toBe("normal");
      expect(warningLevel).toBe("warning");
      expect(criticalLevel).toBe("critical");
    });
  });

  describe("2. getCostColorLevel function", () => {
    it("should return 'normal' for cost < $1", () => {
      expect(getCostColorLevel(0.5)).toBe("normal");
    });

    it("should return 'warning' for cost >= $1 and < $5", () => {
      expect(getCostColorLevel(2.5)).toBe("warning");
    });

    it("should return 'critical' for cost >= $5", () => {
      expect(getCostColorLevel(10.0)).toBe("critical");
    });
  });

  describe("3. formatBurnRate function", () => {
    it("should format 0.50 in compact mode as '50c/h'", () => {
      expect(formatBurnRate(0.5, true)).toBe("50c/h");
    });

    it("should format 2.50 in compact mode as '$2.5/h'", () => {
      expect(formatBurnRate(2.5, true)).toBe("$2.5/h");
    });

    it("should return '$0.0/h' for null", () => {
      expect(formatBurnRate(null)).toBe("$0.0/h");
    });

    it("should return '$0.0/h' for null in compact mode", () => {
      expect(formatBurnRate(null, true)).toBe("$0.0/h");
    });
  });

  describe("4. formatCacheHitRate function", () => {
    it("should format pre-calculated percentage as 'cache:45%'", () => {
      expect(formatCacheHitRate(45)).toBe("cache:45%");
    });

    it("should calculate percentage from raw tokens (cacheRead=100, input=200, cacheCreate=50)", () => {
      // Total = 100 + 200 + 50 = 350
      // Percentage = (100 / 350) * 100 = 28.57% -> rounds to 29%
      expect(formatCacheHitRate(100, 200, 50)).toBe("cache:29%");
    });
  });

  describe("5. formatCost with estimated flag", () => {
    it("should format 5.00 without estimated flag as '$5.00'", () => {
      expect(formatCost(5.0, false)).toBe("$5.00");
    });

    it("should format 5.00 with estimated flag as '≈$5.00'", () => {
      expect(formatCost(5.0, true)).toBe("≈$5.00");
    });

    it("should format null as '$0.00'", () => {
      expect(formatCost(null)).toBe("$0.00");
    });
  });
});
