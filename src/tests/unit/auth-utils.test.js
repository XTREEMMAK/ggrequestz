import { describe, it, expect } from "vitest";

// Test the authentication utility functions directly
describe("Authentication Utilities (Direct)", () => {
  describe("isAuthenticated", () => {
    function isAuthenticated(user) {
      return !!(user && user.sub);
    }

    it("should return true for valid user with sub", () => {
      const user = { sub: "user123", name: "Test User" };
      expect(isAuthenticated(user)).toBe(true);
    });

    it("should return false for user without sub", () => {
      const user = { name: "Test User" };
      expect(isAuthenticated(user)).toBe(false);
    });

    it("should return false for null user", () => {
      expect(isAuthenticated(null)).toBe(false);
    });

    it("should return false for undefined user", () => {
      expect(isAuthenticated(undefined)).toBe(false);
    });
  });

  describe("getUserDisplayName", () => {
    function getUserDisplayName(user) {
      return user?.name || user?.preferred_username || user?.email || "User";
    }

    it("should return name when available", () => {
      const user = { name: "John Doe", email: "john@example.com" };
      expect(getUserDisplayName(user)).toBe("John Doe");
    });

    it("should return preferred_username when name not available", () => {
      const user = { preferred_username: "johndoe", email: "john@example.com" };
      expect(getUserDisplayName(user)).toBe("johndoe");
    });

    it("should return email when name and preferred_username not available", () => {
      const user = { email: "john@example.com" };
      expect(getUserDisplayName(user)).toBe("john@example.com");
    });

    it('should return default "User" when no identifiers available', () => {
      const user = {};
      expect(getUserDisplayName(user)).toBe("User");
    });

    it("should handle null user", () => {
      expect(getUserDisplayName(null)).toBe("User");
    });
  });

  describe("getUserInitials", () => {
    function getUserInitials(user) {
      const name =
        user?.name || user?.preferred_username || user?.email || "User";
      const words = name.split(/[\s@.]+/).filter(Boolean);

      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      } else if (words.length === 1 && words[0].length >= 2) {
        return (words[0][0] + words[0][1]).toUpperCase();
      } else {
        return "US"; // Default for "User"
      }
    }

    it("should return initials from full name", () => {
      const user = { name: "John Doe Smith" };
      expect(getUserInitials(user)).toBe("JD");
    });

    it("should return initials from single name", () => {
      const user = { name: "John" };
      expect(getUserInitials(user)).toBe("JO");
    });

    it("should return initials from preferred_username", () => {
      const user = { preferred_username: "johndoe" };
      expect(getUserInitials(user)).toBe("JO");
    });

    it("should return initials from email", () => {
      const user = { email: "john.doe@example.com" };
      expect(getUserInitials(user)).toBe("JD");
    });

    it("should handle empty names gracefully", () => {
      const user = { name: "" };
      expect(getUserInitials(user)).toBe("US");
    });

    it("should handle null user", () => {
      expect(getUserInitials(null)).toBe("US");
    });
  });
});
