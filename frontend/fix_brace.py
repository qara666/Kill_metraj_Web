import re

path = '/Users/msun/Desktop/Project apps/Kill_metraj_Web/frontend/src/components/route/RouteManagement.tsx'
with open(path, 'r') as f:
    lines = f.readlines()

def check():
    stack = []
    text = "".join(lines[2652:3293])
    # strip block comments
    text = re.sub(r'\{/\*.*?\*/\}', '', text, flags=re.DOTALL)
    # strip template literals
    # text = re.sub(r'\`[^\`]*\`', '``', text, flags=re.DOTALL) 
    # strip string literals
    # text = re.sub(r'\"[^\"]*\"', '""', text)
    # text = re.sub(r"\'[^\']*\'", "''", text)

    for i, char in enumerate(text):
        if char == '{': stack.append(i)
        elif char == '}':
            if stack: stack.pop()
            else:
                print("Extra } at index", i)
                return
    print("Remaining open {:", len(stack))

check()
