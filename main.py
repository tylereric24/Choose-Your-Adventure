print('''
*******************************************************************************
          |                   |                  |                     |
 _________|________________.=""_;=.______________|_____________________|_______
|                   |  ,-"_,=""     `"=.|                  |
|___________________|__"=._o`"-._        `"=.______________|___________________
          |                `"=._o`"=._      _`"=._                     |
 _________|_____________________:=._o "=._."_.-="'"=.__________________|_______
|                   |    __.--" , ; `"=._o." ,-"""-._ ".   |
|___________________|_._"  ,. .` ` `` ,  `"-._"-._   ". '__|___________________
          |           |o`"=._` , "` `; .". ,  "-._"-._; ;              |
 _________|___________| ;`-.o`"=._; ." ` '`."\` . "-._ /_______________|_______
|                   | |o;    `"-.o`"=._``  '` " ,__.--o;   |
|___________________|_| ;     (#) `-.o `"=.`_.--"_o.-; ;___|___________________
____/______/______/___|o;._    "      `".o|o_.--"    ;o;____/______/______/____
/______/______/______/_"=._o--._        ; | ;        ; ;/______/______/______/_
____/______/______/______/__"=._o--._   ;o|o;     _._;o;____/______/______/____
/______/______/______/______/____"=._o._; | ;_.--"o.--"_/______/______/______/_
____/______/______/______/______/_____"=.o|o_.--""___/______/______/______/____
/______/______/______/______/______/______/______/______/______/______/_____ /
*******************************************************************************
''')
print("Welcome to Treasure Island.")
print("Your mission is to find the treasure.") 


part1 = input("You arrive at a fork in the road, would you like to go left or right? ").lower()
if part1 == "left":
    print("You have arrived at a mysterious castle with 3 doors one red, one yellow, and one gold.")

    part2 = input("Which door would you like to enter? red, yellow, or gold? ")
elif part1 == "right":
    print("You find a cliff with a zipline down to a small island. There is also a ladder downwards but you would have to swim across.")
    part2 = input("Will you swim or zipline? ").lower()
else:
    print("Input not found, Try Again")
    exit()
    

if part2 == "swim":
    print("You climb down the ladder and go to swim across, you are immediately attacked and engulfed by a mob of crocodiles. Game over.")
    exit()
elif part2 == "zipline":
    print("You are headed down the zipline, you hear a loud *crack*. The zipline has snapped and you fall into the lake and are engulfed by crocodiles.")
    exit()
elif part2 == "red":
    print("You entered the room and immediately fell into a pit of slithery little snakes, so sorry you died. Game over.")
    exit()
elif part2 == "yellow":
    print("You enter a dimly lit room. You see a hunched figure in the corner and approach it. It is Danny Devito. He violently bludgeons you to death. Game over.")
    exit()
elif part2 == "gold":
    part3 = input("You enter the door and find two hallways. Which direction would you like to go forward or left? ").lower()
else:
    part2 = input("Try again. ")

if part3 == 'forward':
    part4 = input("You enter a room and find a gold chalice full of liquid, do you drink it? Type Y or N ").lower()
elif part3 == "left":
    part4 = input("You find a door but on the other side of the door you hear a strange scratching sound and grunting, do you enter or turn around? ").lower()

if part4 == 'y':
    print("Did no one ever tell you not to drink strange liquids you find? Cmon man, you started to get really dizzy, you can't move and now Danny Devito found you. He feeds you to a pack of Chihuahuas. Game over.")
    exit()
elif part4 == 'n':
    part5 = input("ARE YOU SURE?!?! It looks pretty refreshing, it might be McDonalds Sprite. Type Y or N ").lower()
elif part4 == "turn around":
    print("EVERY NOW AND THEN I GET A LITTLE BIT LONEL...Uhhhh yeah, Good Choice. Lets head the other direction.")
    part5 = input("You head down the other direction, you enter a room and find a gold chalice full of liquid, do you drink it? Type Yes or No ").lower()
elif part4 == "enter":
    print("You enter the room and find Nicolas Cage inside of a wrestling ring fighting a grizzly bear. He immediately locks eyes with you, speaks a few words in a foreign dialect and the grizzly rushes over and mauls you to death. Game over")
    exit()

    

if part5 == "y":
    print("It was not McDonalds Sprite...You have made a terrible mistake. You lost consciousness and never woke up...honestly who knows what happens to you but your fault for giving into peer pressure. Game Over")
    exit()
elif part5 == "n":
    print("You resisted tempation and past the chalice of what appeared to be a refreshing liquid you find a door, you go through the door and you find the treasure you are looking for....it's....the keys to a 1990 Honda Civic and a coupon for a free 20 piece McNugget. Congrats. You win. I think? ")
    exit()
elif part5 == "no":
    print("You resisted tempation and past the chalice of what appeared to be a refreshing liquid you find a door, you go through the door and you find the treasure you are looking for....it's....the keys to a 1990 Honda Civic and a coupon for a free 20 piece McNugget. Congrats. You win. I think? ")
    exit()
elif part5 == "yes":
    print("It was not McDonalds Sprite...You have made a terrible mistake. You lost consciousness and never woke up...honestly who knows what happens to you but your fault for giving into peer pressure. Game Over")
    exit()








