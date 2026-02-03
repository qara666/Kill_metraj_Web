import os
import re

# Emoji regex pattern (covering a wide range of common emojis)
EMOJI_PATTERN = re.compile(
    "["
    "\U0001f300-\U0001f9ff"  # Miscellaneous Symbols and Pictographs to Supplemental Symbols and Pictographs
    "\U00002600-\U000026ff"  # Miscellaneous Symbols
    "\U00002700-\U000027bf"  # Dingbats
    "\U00002b50"             # White Medium Star
    "\U0000231a"             # Watch
    "\U0000231b"             # Hourglass
    "\U000023e9-\U000023f3"  # Fast-forward to Hourglass Flowing Sand
    "\U000023f8-\U000023fa"  # Pause to Record
    "\U000025aa-\U000025ab"  # White/Black Small Square
    "\U000025fb-\U000025fe"  # White/Black Medium Small/Small Square
    "\U00002934-\U00002935"  # Arrow pointing right then curving up/down
    "\U00002b05-\U00002b07"  # Left/Up/Down Arrow
    "\U00002b1b-\U00002b1c"  # Black/White Large Square
    "\U00003297"             # Congratulation Sign in Circle
    "\U00003299"             # Secret Sign in Circle
    "]+", 
    flags=re.UNICODE
)

def remove_emojis_from_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check if content has emojis
        if EMOJI_PATTERN.search(content):
            new_content = EMOJI_PATTERN.sub('', content)
            
            # Clean up resulting double spaces or trailing punctuation often left after emoji removal
            # e.g., "Error! 🚀" -> "Error! " -> "Error!"
            new_content = re.sub(r'\s{2,}', ' ', new_content)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            return True
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
    return False

def main():
    target_dirs = [
        'backend/src',
        'backend/workers',
        'frontend/src'
    ]
    
    extensions = ('.js', '.ts', '.jsx', '.tsx')
    processed_count = 0
    modified_count = 0
    
    for target_dir in target_dirs:
        abs_target_dir = os.path.join(os.getcwd(), target_dir)
        if not os.path.exists(abs_target_dir):
            print(f"Directory not found: {abs_target_dir}")
            continue
            
        for root, dirs, files in os.walk(abs_target_dir):
            for file in files:
                if file.endswith(extensions):
                    file_path = os.path.join(root, file)
                    processed_count += 1
                    if remove_emojis_from_file(file_path):
                        modified_count += 1
                        print(f"Modified: {file_path}")

    print(f"Finished. Processed {processed_count} files, modified {modified_count} files.")

if __name__ == "__main__":
    main()
