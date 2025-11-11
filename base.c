#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdbool.h>

// Maximum length for an IP address string
#define MAX_IP_LEN 16
// Number of routers defined
#define NUM_ROUTERS 4
// Max number of networks per router
#define MAX_NETWORKS_PER_ROUTER 4
// Max number of stored routes (SourceIP*DestIP)
#define MAX_ROUTE_HISTORY 20

// Structure to hold network IPs connected to a router
struct RouterConfig {
    char ip[MAX_NETWORKS_PER_ROUTER][MAX_IP_LEN];
};

// Global storage for router configurations
struct RouterConfig router_configs[NUM_ROUTERS];

// Global storage for route history
char route_history[MAX_ROUTE_HISTORY][MAX_IP_LEN * 2 + 1];
// Global storage for intermediate router history (long long to store concatenated ints)
long long intermediate_history[MAX_ROUTE_HISTORY];
int history_count = 0;

// =======================================================
// UTILITY FUNCTIONS
// =======================================================

/**
 * @brief Checks if a string contains only digits.
 * @param str The string to validate.
 * @return True if valid, False otherwise.
 */
bool validate_number(const char *str) {
    if (!*str) return false;
    while (*str) {
        if (!isdigit((unsigned char)*str)) {
            return false;
        }
        str++;
    }
    return true;
}

/**
 * @brief Validates an IPv4 address format (e.g., 192.168.1.1).
 * @param ip_str The IP address string.
 * @return True if valid (4 octets, 0-255), False otherwise.
 */
bool validate_ip(const char *ip_str) {
    if (ip_str == NULL || ip_str[0] == '\0') return false;

    // We must work on a copy because strtok modifies the string.
    char temp_ip[MAX_IP_LEN];
    strncpy(temp_ip, ip_str, MAX_IP_LEN - 1);
    temp_ip[MAX_IP_LEN - 1] = '\0';

    char *ptr;
    int dots = 0;
    int num;
    int octet_count = 0;

    ptr = strtok(temp_ip, ".");

    while (ptr) {
        octet_count++;
        if (!validate_number(ptr)) return false;

        num = atoi(ptr);
        if (num < 0 || num > 255) return false;

        ptr = strtok(NULL, ".");
        if (ptr != NULL) {
            dots++;
        }
    }

    // Must have 4 octets and 3 dots
    if (octet_count != 4 || dots != 3) {
        return false;
    }
    return true;
}

/**
 * @brief Finds the router connected to a given IP address (based on exact match).
 * @param ip The IP address string to search for.
 * @return The router number (1-based), or 0 if not found.
 */
int find_router_by_ip(const char *ip, const int *num_networks) {
    for (int i = 0; i < NUM_ROUTERS; i++) {
        for (int j = 0; j < num_networks[i]; j++) {
            if (strcmp(router_configs[i].ip[j], ip) == 0) {
                // Return 1-based router number
                return i + 1;
            }
        }
    }
    return 0; // Not found
}

/**
 * @brief Concatenates two integers for history logging (e.g., 1, 2 -> 12).
 * Note: Only safe for small numbers (like router IDs).
 */
long long concat_router_ids(long long current_val, int new_id) {
    char s1[32], s2[32];
    sprintf(s1, "%lld", current_val);
    sprintf(s2, "%d", new_id);
    strcat(s1, s2);
    return atoll(s1);
}

// =======================================================
// MAIN ROUTING LOGIC
// =======================================================

void run_routing_simulation() {
    // Connection Matrix: 1 = Direct Link, 0 = No Direct Link
    // Router numbering: [0] = R1, [1] = R2, [2] = R3, [3] = R4
    int connection_matrix[NUM_ROUTERS][NUM_ROUTERS] = {
        {1, 1, 0, 1}, // R1 connects to R1, R2, R4
        {1, 1, 1, 0}, // R2 connects to R1, R2, R3
        {0, 1, 1, 1}, // R3 connects to R2, R3, R4
        {1, 0, 1, 1}  // R4 connects to R1, R3, R4
    };

    int num_networks[NUM_ROUTERS] = {0};
    int total_networks = 0;

    printf("--- Network Router Simulation ---\n");
    printf("Routers are connected like this (1 = Direct Link):\n");
    printf("  1 2 3 4\n");
    for (int i = 0; i < NUM_ROUTERS; i++) {
        printf("%d ", i + 1);
        for (int j = 0; j < NUM_ROUTERS; j++) {
            printf("%d ", connection_matrix[i][j]);
        }
        printf("\n");
    }

    // 1. INPUT NETWORK IPs
    for (int i = 0; i < NUM_ROUTERS; i++) {
        do {
            printf("How many networks are joined to router %d (max %d): ", i + 1, MAX_NETWORKS_PER_ROUTER);
            if (scanf("%d", &num_networks[i]) != 1) {
                // Handle non-integer input
                while (getchar() != '\n');
                num_networks[i] = -1;
            }
        } while (num_networks[i] < 0 || num_networks[i] > MAX_NETWORKS_PER_ROUTER);
        total_networks += num_networks[i];
    }
    printf("Total networks defined: %d\n", total_networks);

    // Input IP addresses
    char input_ip[MAX_IP_LEN];
    for (int i = 0; i < NUM_ROUTERS; i++) {
        for (int j = 0; j < num_networks[i]; j++) {
            do {
                printf("Enter router %d Network IP address %d: ", i + 1, j + 1);
                scanf("%s", input_ip);
            } while (!validate_ip(input_ip));
            // Copy validated IP to the configuration structure
            strcpy(router_configs[i].ip[j], input_ip);
        }
    }
    printf("\nIP configurations loaded successfully.\n");

    // 2. ROUTING LOOP
    int continue_flag = 0;
    while (continue_flag == 0 && history_count < MAX_ROUTE_HISTORY) {
        char source_ip[MAX_IP_LEN];
        char destination_ip[MAX_IP_LEN];
        int source_router = 0;
        int dest_router = 0;

        printf("\n--- Start Routing Query %d ---\n", history_count + 1);

        // --- Get and Validate Source IP ---
        do {
            printf("Enter source IP address: ");
            scanf("%s", source_ip);
            if (!validate_ip(source_ip)) {
                printf("Invalid IP format. Please re-enter.\n");
                source_router = 0;
                continue;
            }
            source_router = find_router_by_ip(source_ip, num_networks);
            if (source_router == 0) {
                printf("Error: Source IP not found in any router's network list. Please re-enter.\n");
            }
        } while (source_router == 0);

        printf("Source router is %d\n", source_router);

        // --- Get and Validate Destination IP ---
        do {
            printf("Enter Destination IP address: ");
            scanf("%s", destination_ip);
            if (!validate_ip(destination_ip)) {
                printf("Invalid IP format. Please re-enter.\n");
                dest_router = 0;
                continue;
            }
            dest_router = find_router_by_ip(destination_ip, num_networks);
            if (dest_router == 0) {
                printf("Error: Destination IP not found in any router's network list. Please re-enter.\n");
            }
        } while (dest_router == 0);

        printf("Destination router is %d\n", dest_router);

        // --- Check History ---
        char current_route_key[MAX_IP_LEN * 2 + 1];
        sprintf(current_route_key, "%s*%s", source_ip, destination_ip);

        int final_history_index = -1;
        for (int l2 = 0; l2 < history_count; l2++) {
            if (strcmp(route_history[l2], current_route_key) == 0) {
                final_history_index = l2;
                break;
            }
        }

        if (final_history_index != -1) {
            // Route found in history
            printf("\n--- HISTORY FOUND ---\n");
            printf("Source IP address: %s \n--> Source Router: %d \n--> Destination Router: %d \n--> Destination IP address: %s\n",
                   source_ip, source_router, dest_router, destination_ip);
            printf("Intermediate Routers details (Concatenated IDs): %lld\n", intermediate_history[final_history_index]);
        } else {
            // --- Determine New Route ---
            int current_router = source_router;
            int direct_connection = connection_matrix[source_router - 1][dest_router - 1];
            long long route_path = concat_router_ids(0, source_router); // Start path with source router

            // If direct link exists, offer short path option
            if (direct_connection == 1) {
                int choice;
                printf("Direct link found between R%d and R%d.\n", source_router, dest_router);
                printf("Do you want to choose the direct path for routing (1=Yes, 0=No/Custom): ");
                scanf("%d", &choice);

                if (choice == 1) {
                    route_path = concat_router_ids(route_path, dest_router);
                    printf("\n--- DIRECT ROUTE SELECTED ---\n");
                    goto route_complete;
                }
            }
            
            // --- Custom Routing (if no direct path or user chose custom) ---
            printf("\n--- MANUAL ROUTE DEFINITION ---\n");
            int intermediate_routers[NUM_ROUTERS] = {0};
            int router_index = 0;
            int next_router = -1;
            
            // Keep track of the current point in the path definition
            current_router = source_router; 

            do {
                printf("Current router: R%d. Enter next intermediate router (1-%d, or 0 to finalize): ", current_router, NUM_ROUTERS);
                if (scanf("%d", &next_router) != 1) {
                    // Handle non-integer input
                    while (getchar() != '\n');
                    next_router = -1;
                }
                
                // Check if the user wants to finalize the path (if a connection exists to dest)
                if (next_router == 0) {
                    if (connection_matrix[current_router - 1][dest_router - 1] == 1) {
                        printf("Path finalized: R%d -> R%d (Destination)\n", current_router, dest_router);
                        route_path = concat_router_ids(route_path, dest_router);
                        break; // Exit do-while loop
                    } else {
                        printf("Cannot finalize yet. Router R%d has no direct link to R%d (Destination).\n", current_router, dest_router);
                        continue;
                    }
                }
                
                // Check if the input is valid router ID
                if (next_router < 1 || next_router > NUM_ROUTERS) {
                    printf("Invalid router ID. Must be between 1 and %d.\n", NUM_ROUTERS);
                    continue;
                }
                
                // Check if the chosen router is the destination
                if (next_router == dest_router) {
                     if (connection_matrix[current_router - 1][dest_router - 1] == 1) {
                        route_path = concat_router_ids(route_path, dest_router);
                        printf("Destination R%d reached successfully!\n", dest_router);
                        break; // Exit do-while loop
                    } else {
                        printf("R%d is the destination, but R%d has no direct link to R%d. Please choose an intermediate router first.\n", dest_router, current_router, dest_router);
                        continue;
                    }
                }

                // Check for direct connection from current router to the next intermediate router
                if (connection_matrix[current_router - 1][next_router - 1] == 1) {
                    // Valid connection: update path and current router
                    intermediate_routers[router_index++] = next_router;
                    route_path = concat_router_ids(route_path, next_router);
                    current_router = next_router;
                    
                    // Optimization: check if the new intermediate router can connect to the destination
                    if (connection_matrix[current_router - 1][dest_router - 1] == 1) {
                        printf("R%d is now directly connected to Destination R%d. Type 0 to finalize or enter another intermediate router.\n", current_router, dest_router);
                    }
                } else {
                    printf("Invalid path: Router R%d has no direct link to Router R%d.\n", current_router, next_router);
                }

            } while (current_router != dest_router);


            route_complete:; // Label for jump from direct path logic

            // 3. Save History and Display Result
            if (history_count < MAX_ROUTE_HISTORY) {
                strcpy(route_history[history_count], current_route_key);
                intermediate_history[history_count] = route_path; // Includes Source and Destination
                
                printf("\n--- NEW ROUTE LOGGED ---\n");
                printf("Source IP: %s\n", source_ip);
                printf("Intermediate Routers Path (IDs): ");
                long long path_temp = route_path;
                
                // A very crude way to display the concatenated path:
                printf("%lld\n", path_temp); 
                
                printf("\nPath established: R%d ", source_router);
                for(int i=0; i<router_index; ++i) {
                     printf("--> R%d ", intermediate_routers[i]);
                }
                printf("--> R%d\n", dest_router);
                
                history_count++;
            } else {
                printf("\nWarning: Route history full.\n");
            }

        } // End of history check (else block)

        // 4. Continue Prompt
        printf("\nDo you want to continue routing? (0=Yes, 1=No): ");
        if (scanf("%d", &continue_flag) != 1) {
             while (getchar() != '\n');
             continue_flag = 1; // Default to stop on bad input
        }
    }
    printf("\n--- Simulation Ended ---\n");
}

int main() {
    // Disable synchronization with C stdio for better performance measurement
    // Not strictly necessary for this program, but good practice in competitive programming environments.
    // std::ios_base::sync_with_stdio(false); is C++ specific.
    
    run_routing_simulation();
    
    return 0;
}