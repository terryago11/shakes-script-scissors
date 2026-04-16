# Setting Up ShakesScriptScissors

This guide is written for directors and dramaturgs who have never used a terminal or written a line of code. You don't need to understand what any of this means — just follow each step in order, copy and paste the commands exactly, and you'll have the app running in about 20 minutes.

If you get stuck, take a screenshot of your screen and send it to your developer. The most important thing to include is any red text in the terminal window — that's the error message.

---

## What you'll need

- A Mac (macOS) or Windows computer
- An internet connection
- About 20 minutes the first time

---

## macOS Setup

### Step 1 — Open the Terminal

The Terminal is a text-based control panel for your Mac. It lets you type instructions directly to the computer. You don't need to understand how it works — just think of it as a text message app for your Mac.

**To open it:**
1. Press **⌘ Cmd + Space** to open Spotlight Search
2. Type `Terminal`
3. Press **Enter**

A window opens with a prompt that looks something like `yourusername@MacBook ~ %`. This is normal. You're ready to type commands.

> **Tip:** You can make the text larger with **⌘ Cmd + =** if it's hard to read.

---

### Step 2 — Install Homebrew

Homebrew is a tool that lets you install other tools. It's the standard way to set things up on a Mac.

Paste this entire line into Terminal and press **Enter**:

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**What to expect:**
- It will ask for your Mac password (the one you use to log in). As you type it, nothing appears on screen — that's normal and intentional. Just type it and press Enter.
- It will print a lot of text. This is normal. Wait for it to finish (it may take a few minutes).
- When it's done, you'll see your prompt again.

If it tells you to run one more command at the end (something starting with `echo` or `eval`), copy that command and run it too.

---

### Step 3 — Install nvm

nvm stands for "Node Version Manager". It manages the programming language (Node.js) that the app runs on.

Paste this into Terminal and press **Enter**:

```
brew install nvm
```

Then paste these three lines one at a time (press Enter after each):

```
mkdir -p ~/.nvm
```

```
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
```

```
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
```

Then close the Terminal window and open a new one (⌘ Cmd + Q, then open Terminal again from Spotlight). This makes the new settings take effect.

---

### Step 4 — Install Node.js

Node.js is the programming language the app runs on.

In your new Terminal window, paste this and press **Enter**:

```
nvm install 22
```

**What to expect:** It will download and install Node.js version 22. This takes about a minute. When it's done, you'll see your prompt again.

Check it worked by typing:

```
node --version
```

You should see something like `v22.9.0`. If you do, Node.js is installed correctly.

---

### Step 5 — Download the app

You need to get a copy of the app onto your computer.

**Option A — clone from GitHub (recommended):**

Paste this and press Enter:

```
git clone https://github.com/terryago11/shakes-script-scissors.git ~/shakes-script-scissors
```

**Option B — if your developer gave you a ZIP file:**

1. Unzip the file (double-click it)
2. Move the resulting folder to your home folder (the one that opens when you click the house icon in Finder)
3. Note the exact folder name — you'll need it in Step 6

---

### Step 6 — Navigate to the app folder

"Navigating" in Terminal means telling it which folder to look inside. Paste this and press **Enter** (adjust the folder name if yours is different):

```
cd ~/shakes-script-scissors
```

Your prompt will now show the folder name. You're inside the app folder.

---

### Step 7 — Install app dependencies

The app relies on hundreds of small software packages. This command downloads them all:

```
npm install
```

**What to expect:** A lot of text scrolls by. This is normal. It takes 1–3 minutes. When it's done, you'll see your prompt again.

Then download the Shakespeare play texts:

```
git submodule update --init
```

**What to expect:** It downloads about 15MB of data. You'll see some output and then your prompt again.

---

### Step 8 — Set up your password (required)

This step is required — the app will not start without it. You need to create a small configuration file called `.env` with two pieces of information: a secret key and a password. This protects the app so that anyone else on your network can't open it in their browser.

**First, choose a password** for your team to log in with (e.g. `macbeth2026`). Write it down somewhere safe.

**Generate your secret key** — paste this and press Enter:

```
openssl rand -base64 32
```

It prints a long string of random characters. Copy the entire output (click and drag to select, then ⌘ Cmd + C).

**Generate your password hash** — replace `yourpassword` below with the password you chose, then paste and press Enter:

```
node -e "const b=require('bcryptjs'); console.log(b.hashSync('yourpassword',10))"
```

It prints a long string starting with `$2a$10$`. Copy the entire output.

**Create the `.env` file:**

Open the built-in text editor by typing:

```
nano .env
```

A text editor opens inside Terminal. Type these two lines exactly, replacing the placeholder values with the strings you copied above:

```
SESSION_SECRET=paste_your_secret_key_here
AUTH_PASSWORD_HASH=paste_your_hash_here
```

> **Important:** No spaces around the `=` sign. No quotation marks. The hash line should start with `$2a$10$`.

When you're done typing, press **Ctrl + X** (not ⌘ Cmd), then **Y**, then **Enter** to save and exit.

---

### Step 9 — Start the app

Paste these two commands (press Enter after each):

```
export PATH="$HOME/.nvm/versions/node/v22.9.0/bin:$PATH"
```

```
npm run dev
```

**What to expect:** After a few seconds you'll see something like:

```
▲ Next.js 16.x.x
- Local:        http://localhost:3000
```

Open your web browser and go to:

```
http://localhost:3000
```

You should see the ShakesScriptScissors login page. Enter the password you chose in Step 8. That's it — you're in.

---

### Starting the app next time

You don't need to redo the setup. Each time you want to use the app:

1. Open Terminal
2. Type `cd ~/shakes-script-scissors` and press Enter
3. Type `export PATH="$HOME/.nvm/versions/node/v22.9.0/bin:$PATH"` and press Enter
4. Type `npm run dev` and press Enter
5. Go to `http://localhost:3000` in your browser

To stop the app, click in the Terminal window and press **Ctrl + C**.

---

---

## Windows Setup

### Step 1 — Open PowerShell as Administrator

PowerShell is the Windows equivalent of Terminal.

1. Click the **Start** menu (Windows icon in the bottom-left)
2. Type `PowerShell`
3. Right-click **Windows PowerShell** in the results
4. Click **Run as administrator**
5. Click **Yes** if Windows asks for permission

A blue window opens. You're ready.

---

### Step 2 — Install Git

Git is the tool that downloads the app and keeps it up to date.

1. Go to [https://git-scm.com/download/win](https://git-scm.com/download/win) in your browser
2. The download starts automatically — run the installer
3. Accept all the default settings (just click Next through every screen)
4. Click Finish when it's done

Close PowerShell and open a new one (repeat Step 1) so it recognises the new installation.

---

### Step 3 — Install nvm-windows

nvm-windows manages the programming language the app runs on.

1. Go to [https://github.com/coreybutler/nvm-windows/releases/latest](https://github.com/coreybutler/nvm-windows/releases/latest) in your browser
2. Download the file called `nvm-setup.exe`
3. Run the installer and accept all the default settings
4. Click Finish

Close PowerShell and open a new one as Administrator again.

---

### Step 4 — Install Node.js

Paste this into PowerShell and press **Enter**:

```
nvm install 22
```

Then:

```
nvm use 22
```

Check it worked:

```
node --version
```

You should see something like `v22.9.0`.

---

### Step 5 — Download the app

**Option A — clone from GitHub (recommended):**

Paste this and press Enter:

```
git clone https://github.com/terryago11/shakes-script-scissors.git C:\shakes-script-scissors
```

**Option B — if your developer gave you a ZIP file:**

1. Unzip the file (right-click → Extract All)
2. Note the path to the folder (e.g. `C:\Users\YourName\shakes-script-scissors`)

---

### Step 6 — Navigate to the app folder

```
cd C:\shakes-script-scissors
```

Adjust the path if yours is in a different location.

---

### Step 7 — Install app dependencies

```
npm install
```

Wait for it to finish (1–3 minutes), then:

```
git submodule update --init
```

---

### Step 8 — Set up your password (required)

This step is required — the app will not start without it.

**Choose a password** for your team (e.g. `macbeth2026`). Write it down.

**Generate your secret key** — paste this and press Enter:

```
node -e "const crypto=require('crypto'); console.log(crypto.randomBytes(32).toString('base64'));"
```

Copy the output.

**Generate your password hash** — replace `yourpassword` with your chosen password:

```
node -e "const b=require('bcryptjs'); console.log(b.hashSync('yourpassword',10))"
```

Copy the output (starts with `$2a$10$`).

**Create the `.env` file** — open Notepad:

```
notepad .env
```

If Notepad asks whether to create a new file, click **Yes**.

Type these two lines, replacing the placeholders with the values you copied:

```
SESSION_SECRET=paste_your_secret_key_here
AUTH_PASSWORD_HASH=paste_your_hash_here
```

> **Important:** No spaces around the `=` sign. No quotation marks.

Save the file (**Ctrl + S**) and close Notepad.

---

### Step 9 — Start the app

```
npm run dev
```

After a few seconds you'll see:

```
▲ Next.js 16.x.x
- Local:        http://localhost:3000
```

Open your browser and go to `http://localhost:3000`. Log in with your password.

---

### Starting the app next time

1. Open PowerShell as Administrator
2. `cd C:\shakes-script-scissors`
3. `npm run dev`
4. Go to `http://localhost:3000`

To stop the app: click in PowerShell and press **Ctrl + C**.

---

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `command not found: npm` or `npm is not recognized` | The nvm setup didn't load. Close Terminal/PowerShell, open a new one, and try again. On macOS, also try running the `export PATH=...` command from Step 9 first. |
| `Port 3000 already in use` | Something else is using that port. Try: `npm run dev -- --port 3001` and go to `http://localhost:3001` instead. |
| `Cannot find module` | Dependencies aren't installed. Run `npm install` again from inside the app folder. |
| `Module not found: git submodule` | Run `git submodule update --init` from inside the app folder. |
| Login page appears but my password is rejected | Open `.env` and check: no extra spaces, no quotation marks around the values, the hash starts with `$2a$10$`. |
| The page is blank or shows a 404 error | Make sure `npm run dev` is still running in your terminal. If it stopped, start it again. |
| The app was working yesterday but not today | Open Terminal/PowerShell, `cd` to the app folder, and run `npm run dev` again — the app doesn't run in the background when you close the terminal. |

---

## Asking for help

If you get stuck, take a screenshot of your terminal and send it to your developer. **The red text is the most important part** — that's the error message that tells them what went wrong. Include what step you were on.

You can also take a screenshot of your whole screen so they can see exactly what you're seeing.
