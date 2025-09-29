---

kanban-plugin: board

---

## a
- [ ] b
  ~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~
  middle
  ~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~

## taskinclude
- [ ] !!!taskinclude(markdown-include-2.md)!!!

## column without include #stack
- [ ] ./folder with space/image.png
  ~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~
  middle
  ~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~
  third
  ~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~
    ![image](/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/folder%20with%20space/image-512x512.png)
  
  - a
  - b
  - c
  
  <hi>
  
  Modify me 6

## !!!columninclude(markdown-presentation-a.md)!!! #urgent

## standard include #stack
- [ ] root/include.md
  !!!include(./root/include.md)!!!


