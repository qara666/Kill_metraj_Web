import re

path = '/Users/msun/Desktop/Project apps/Kill_metraj_Web/frontend/src/components/route/RouteManagement.tsx'
with open(path, 'r') as f:
    lines = f.readlines()

# Extract lines from 2501 (<>) to 3625 (</>)
start_line = 2501
fragment_lines = lines[start_line:3625]

class Tag:
    def __init__(self, name, line_num):
        self.name = name
        self.line_num = line_num

stack = []

for i, line in enumerate(fragment_lines):
    line_num = start_line + i + 1
    # Very crude regex to find opening tags <name and closing tags </name
    # Exclude self-closing <name ... />
    
    # Strip comments {/* ... */} and strings
    clean_line = re.sub(r'\{/\*.*?\*/\}', '', line)
    clean_line = re.sub(r'\"[^\"]*\"', '""', clean_line)
    clean_line = re.sub(r'\'[^\']*\'', "''", clean_line)
    clean_line = re.sub(r'\`[^\`]*\`', "``", clean_line)
    
    # Simple regex for tags inside <> avoiding things like < 0
    # Find all <tag ...> or <tag>
    opens = re.findall(r'<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>', clean_line)
    # Exclude self closing ending in />
    actual_opens = [t for t in re.findall(r'<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*(?<!/)>', clean_line)]
    # Wait, some tags span multiple lines!
    
