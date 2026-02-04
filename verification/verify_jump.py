from playwright.sync_api import sync_playwright
import os

def verify_game_jump(page):
    page.goto("http://localhost:5173")

    # Wait for canvas
    page.wait_for_selector("#game-canvas")

    # 1. Start Game
    page.click("#game-overlay")

    # Wait a bit
    page.wait_for_timeout(500)

    # 2. Perform Jump
    page.keyboard.down("Space")
    page.wait_for_timeout(100)

    # Screenshot relative to current working directory
    page.screenshot(path="verification/jump_action.png")

    page.keyboard.up("Space")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_game_jump(page)
        finally:
            browser.close()
