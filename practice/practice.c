#include <stdio.h>
#include <string.h>
#include <stdlib.h>



int main()
{
    char *ptr;
    ptr = (char*)malloc(100);
    if(ptr == NULL)
    {
        perror("Error: ");
        exit(1);

    }


    printf("input strign ? ");
    gets(ptr);
    printf("ptr : %p, %s \n", ptr, ptr);
    free(ptr);
    printf("ptr : %p, %s \n", ptr, ptr);
    ptr = NULL;

    
    return 0;
}